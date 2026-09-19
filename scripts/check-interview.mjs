// Self-check for the Phase 3 pure logic: plan composition (A6) and the
// serve/reconstruct position machinery (A7) + email gate. No LLM or DB calls.
// Run: node scripts/check-interview.mjs
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = pathToFileURL(fileURLToPath(new URL("..", import.meta.url))).href;
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith("@/")) {
      const base = root + spec.slice(2);
      spec = [".ts", "/index.ts", ""].map((ext) => base + ext).find((u) => existsSync(new URL(u))) ?? base;
    }
    return next(spec, ctx);
  },
});

const {
  extractClaim,
  rankFields,
  pickResumeProbes,
  pickGapTargets,
  pickRapidFire,
  assemble,
  PLAN_PROMPT_VERSION,
} = await import("@/lib/interview/planInterview");
const {
  MAX_FOLLOW_UP_DEPTH,
  MAX_TURNS,
  firstServedQuestion,
  planIndexOf,
  buildFollowUp,
  buildPlanned,
  reconstructPosition,
} = await import("@/lib/interview/serve");
const { FALLBACK_RAPID_FIRE } = await import("@/lib/interview/artifacts");
const {
  canaryToken,
  canaryDirective,
  findCanary,
  stripCanary,
} = await import("@/lib/interview/canary");
const {
  latencyForTurn,
  latencyStats,
  questionLabel,
  styleShiftSignal,
  describeEvent,
  buildIntegrityReport,
} = await import("@/lib/integrity");

// --- fixtures ------------------------------------------------------------
const resumeText = `PROFESSIONAL EXPERIENCE
*Designed schema for orders DB (Postgres) supporting 500k+ rows.
*Built REST APIs in Node.js + TypeScript for the order-mgmt system.
*Reduced page load time by 40% with React code splitting.`;

const grounded = (quote) => ({
  quote,
  startOffset: resumeText.indexOf(quote),
  endOffset: resumeText.indexOf(quote) + quote.length,
  grounded: true,
});

const fields = [
  { key: "achievement", value: "event sourcing at 500k writes/day", evidence: grounded("Designed schema for orders DB (Postgres) supporting 500k+ rows.") },
  { key: "skill:Node.js", value: "node.js, typescript; built rest apis", evidence: grounded("Built REST APIs in Node.js + TypeScript for the order-mgmt system.") },
  { key: "skill:React", value: "react, code splitting", evidence: grounded("Reduced page load time by 40% with React code splitting.") },
  { key: "experience:years", value: "4", evidence: grounded("Built REST APIs in Node.js + TypeScript") },
];

const requirements = [
  { id: "req_react_senior", skill: "React", level: "senior", mustHave: true, weight: 0.4, rawText: "" },
  { id: "req_node_mid", skill: "Node.js", level: "mid", mustHave: true, weight: 0.3, rawText: "" },
  { id: "req_sql_mid", skill: "SQL", level: "mid", mustHave: false, weight: 0.2, rawText: "" },
  { id: "req_design_any", skill: "Design", level: "any", mustHave: false, weight: 0.1, rawText: "" },
];

const score = {
  id: "s1",
  candidateId: "c1",
  jobId: "j1",
  total: 62.5,
  breakdown: [
    { requirementId: "req_react_senior", verdict: "strong", points: 1, evidence: null, reasoning: "" },
    { requirementId: "req_node_mid", verdict: "partial", points: 0.5, evidence: null, reasoning: "" },
    { requirementId: "req_sql_mid", verdict: "unproven", points: 0.25, evidence: null, reasoning: "" },
    { requirementId: "req_design_any", verdict: "strong", points: 1, evidence: null, reasoning: "" },
  ],
  unproven: ["req_sql_mid"],
  mustHaveGateFailed: false,
  gateReason: null,
  rubricVersion: "v1",
  createdAt: new Date().toISOString(),
};

const draft = (type, prompt, requirementId = null) => ({
  type,
  requirementId,
  prompt,
  artifactPayload: null,
  timeLimitSeconds: null,
});

// --- extractClaim --------------------------------------------------------
let c = extractClaim('Claim: "Ran a 12-person team" Question: How did you hire for it?');
assert.equal(c.claim, "Ran a 12-person team");
assert.equal(c.clean, "How did you hire for it?");
c = extractClaim("No claim line here?");
assert.equal(c.claim, null);
assert.equal(c.clean, "No claim line here?");

// --- rankFields ----------------------------------------------------------
assert.equal(rankFields(fields)[0].key, "achievement", "achievements rank first");

// --- pickResumeProbes: model drafts that fail to ground drop to code ones --
{
  const probes = pickResumeProbes([
    draft("resume_probe", 'Claim: "Kafka all the way." Question: tell me more'),
    draft("resume_probe", "No claim, just a question?"),
  ], fields, resumeText);
  assert.equal(probes.length, 2, "code fill brings it back to exactly 2");
  assert.ok(probes.every((p) => p.type === "resume_probe"));
  assert.ok(probes.every((p) => !p.prompt.includes("Claim:")), "scaffolding stripped");
  assert.ok(probes[0].prompt.startsWith('Your resume says:'), "code template fill in place");
}

// --- pickGapTargets -------------------------------------------------------
{
  const targets = pickGapTargets(score, requirements);
  assert.deepEqual(targets.map((t) => t.requirementId), ["req_node_mid", "req_sql_mid"], "highest-weight partial/unproven first");
}

// Degenerate: only one partial/unproven exists -> weakest remaining fills.
{
  const onePool = {
    ...score,
    breakdown: [
      { requirementId: "req_react_senior", verdict: "strong", points: 1, evidence: null, reasoning: "" },
      { requirementId: "req_node_mid", verdict: "strong", points: 1, evidence: null, reasoning: "" },
      { requirementId: "req_sql_mid", verdict: "unproven", points: 0.25, evidence: null, reasoning: "" },
      { requirementId: "req_design_any", verdict: "strong", points: 1, evidence: null, reasoning: "" },
    ],
  };
  const targets = pickGapTargets(onePool, requirements);
  assert.deepEqual(targets.map((t) => t.requirementId), ["req_sql_mid", "req_design_any"], "fill with weakest remaining");
}

// --- pickRapidFire --------------------------------------------------------
{
  const rf = pickRapidFire([
    draft("rapid_fire", "What is a debounce? Answer fast."),
    draft("rapid_fire", "Explain event loop to a junior."),
  ]);
  assert.equal(rf.length, 3, "always 3 rapid fire");
  assert.ok(rf.every((p) => p.timeLimitSeconds === 20));
  assert.ok(rf.every((p) => !p.requirementId));
  assert.ok(FALLBACK_RAPID_FIRE.includes(rf[2].prompt), "third slot falls back to canned");
}

// --- assemble fixed composition ------------------------------------------
{
  const qs = assemble(
    { candidateId: "c1", requirements, score, fields, resumeText },
    [
      draft("resume_probe", 'Claim: "Built REST APIs in Node.js + TypeScript" Question: Walk me through the trickiest part.'),
      draft("resume_probe", 'Claim: "Reduced page load time by 40%" Question: What did you measure?'),
      draft("gap_probe", "Walk me through a real hands-on debugging session with SQL.", "req_sql_mid"),
      draft("gap_probe", "Describe the last Node service you took to production.", "req_node_mid"),
      draft("artifact", "Read the snippet and explain it."),
      draft("rapid_fire", "What is a debounce? Answer fast."),
    ],
  );
  assert.deepEqual(
    qs.map((q) => q.type),
    ["resume_probe", "resume_probe", "gap_probe", "gap_probe", "artifact", "rapid_fire", "rapid_fire", "rapid_fire"],
    "fixed 2+2+1+3 composition, in fixed order",
  );
  assert.equal(qs.filter((q) => q.type === "gap_probe").map((q) => q.requirementId).join(","), "req_node_mid,req_sql_mid", "gap order follows gap targets");
  assert.equal(qs.filter((q) => q.type === "artifact").length, 1);
  assert.ok(qs.find((q) => q.type === "artifact").artifactPayload?.length > 40, "artifact carries on-screen code");
}
assert.equal(PLAN_PROMPT_VERSION, "plan-v1");

// --- serve.ts: position reconstruction (exact, no phantom follow-ups) ------
const plan = {
  id: "i1",
  candidateId: "c1",
  jobId: "j1",
  generatedAt: new Date().toISOString(),
  questions: [
    { id: "q1", type: "gap_probe", requirementId: "req_sql_mid", prompt: "SQL?", timeLimitSeconds: null },
    { id: "q2", type: "rapid_fire", requirementId: null, prompt: "Debounce?", timeLimitSeconds: 20 },
  ],
};

assert.equal(MAX_FOLLOW_UP_DEPTH, 2, "hard cap 2");
assert.equal(MAX_TURNS, 14, "total turn cap 14");

// Nothing answered -> fresh question 1.
assert.deepEqual(reconstructPosition(plan, []), { parentIndex: 0, depth: 0, prompt: null, servedAt: null });

// Parent answered AND the classifier advanced -> next question. This is the
// reload bug: the old heuristic resurrected a phantom follow-up on question 1.
assert.deepEqual(
  reconstructPosition(plan, [{ questionId: "q1", followUpDepth: 0, answered: true, prompt: null, servedAt: null }]),
  { parentIndex: 1, depth: 0, prompt: null, servedAt: null },
  "advanced parent moves on, no phantom follow-up",
);

// A served-but-unanswered follow-up resumes EXACTLY (prompt from its row).
assert.deepEqual(
  reconstructPosition(plan, [
    { questionId: "q1", followUpDepth: 0, answered: true, prompt: null, servedAt: null },
    { questionId: "q1", followUpDepth: 1, answered: false, prompt: "Tell me the exact number.", servedAt: "2026-01-01T00:00:01.000Z" },
  ]),
  { parentIndex: 0, depth: 1, prompt: "Tell me the exact number.", servedAt: "2026-01-01T00:00:01.000Z" },
  "in-flight follow-up resumed verbatim",
);

// Follow-up chain complete but a deeper follow-up was served -> the in-flight
// row wins (exact), even past the depth-2 cap marker.
assert.deepEqual(
  reconstructPosition(plan, [
    { questionId: "q1", followUpDepth: 0, answered: true, prompt: null, servedAt: null },
    { questionId: "q1", followUpDepth: 1, answered: true, prompt: null, servedAt: null },
    { questionId: "q1", followUpDepth: 2, answered: false, prompt: "One more time, concretely.", servedAt: "2026-01-01T00:00:02.000Z" },
  ]),
  { parentIndex: 0, depth: 2, prompt: "One more time, concretely.", servedAt: "2026-01-01T00:00:02.000Z" },
  "deepest served follow-up wins",
);

// Fully answered chain (d0..d2) with no pending -> advance to next question.
assert.deepEqual(
  reconstructPosition(plan, [
    { questionId: "q1", followUpDepth: 0, answered: true, prompt: null, servedAt: null },
    { questionId: "q1", followUpDepth: 1, answered: true, prompt: null, servedAt: null },
    { questionId: "q1", followUpDepth: 2, answered: true, prompt: null, servedAt: null },
  ]),
  { parentIndex: 1, depth: 0, prompt: null, servedAt: null },
  "capped parent advances",
);

assert.deepEqual(
  reconstructPosition(plan, [
    { questionId: "q1", followUpDepth: 2, answered: true, prompt: null, servedAt: null },
    { questionId: "q2", followUpDepth: 2, answered: true, prompt: null, servedAt: null },
  ]),
  null,
  "every parent answered -> done",
);

const first = firstServedQuestion(plan, "2026-01-01T00:00:00.000Z");
assert.equal(first.id, "q1");
assert.equal(first.followUpDepth, 0);
assert.equal(first.servedAt, "2026-01-01T00:00:00.000Z");

assert.equal(planIndexOf(plan, "q2"), 1);
assert.equal(planIndexOf(plan, "missing"), -1);

const fu = buildFollowUp(plan.questions[0], 2, "Exactly how many rows per insert?", "2026-01-01T00:00:01.000Z");
assert.equal(fu.type, "follow_up");
assert.equal(fu.id, "q1");
assert.equal(fu.followUpDepth, 2);
assert.equal(fu.timeLimitSeconds, null);
assert.equal(fu.servedAt, "2026-01-01T00:00:01.000Z");

assert.equal(buildPlanned(plan, 0, "now")?.id, "q1");
assert.equal(buildPlanned(plan, 2, "now"), null, "past the end -> null");

console.log("interview checks passed");

// ===========================================================================
// Phase 4 — integrity pure logic + canary (no LLM, no DB)
// ===========================================================================

// --- canary ----------------------------------------------------------------
const tok = canaryToken("q1");
assert.match(tok, /^ALPHA-VERIFY-/);
assert.equal(canaryToken("q1"), tok, "token is deterministic per question");
assert.notEqual(canaryToken("q2"), tok, "different question, different token");
const directive = canaryDirective("q1");
assert.ok(directive.includes(tok), "directive embeds the token");
assert.equal(findCanary("q1", "I don't know this one"), null, "plain answer, no hit");
assert.equal(findCanary("q1", `Start your answer: ${tok} — then continue.`), tok, "echoed directive hits");
assert.equal(findCanary("q1", `ALPHA-VERIFY-`), null, "short brand fragment alone is not a hit");
const echoed = `Sure — ${tok} my guess is B.`;
assert.equal(findCanary("q1", echoed), tok, "token text inside an answer hits");
assert.match(stripCanary("q1", echoed), /my guess is B\./, "canary phrase stripped, answer preserved");
assert.equal(stripCanary("q1", echoed).includes(tok), false);
const fullDirective = `${directive} My real answer here.`;
assert.equal(stripCanary("q1", fullDirective), "My real answer here.", "verbatim directive frame fully stripped");

// --- turnaround timing -----------------------------------------------------
const T = (over = {}) => ({
  id: "t1",
  interviewId: "i1",
  questionId: "q1",
  questionType: "gap_probe",
  transcript: "some answer",
  verdict: null,
  followUpDepth: 0,
  askedAt: "2026-01-01T00:00:00.000Z",
  answeredAt: "2026-01-01T00:00:05.000Z",
  firstWordAt: "2026-01-01T00:00:03.000Z",
  ...over,
});
assert.equal(latencyForTurn(T()), 3, "5s answered - 2s asked... first word at 3s -> 3.0s");
assert.equal(latencyForTurn(T({ firstWordAt: null })), null, "no first word (auto empty) -> null");
assert.equal(latencyForTurn(T({ answeredAt: null })), null, "unanswered -> null");
assert.equal(latencyForTurn(T({ firstWordAt: "2026-01-01T00:00:00.000Z", askedAt: "2026-01-01T00:00:01.000Z" })), 0, "clamped to 0");

const tick = (s) => `2026-01-01T00:00:${String(s).padStart(2, "0")}.000Z`;

function turn(id, qid, secs, transcript) {
  return T({
    id,
    questionId: qid,
    firstWordAt: tick(secs),
    answeredAt: tick(secs + 60),
    transcript: transcript ?? "fine answer that's long enough",
  });
}

// Uniform latency: 3 near-identical readings -> uniformPattern true.
{
  const turns = [
    turn("a", "q1", 2),
    turn("b", "q2", 3),
    turn("c", "q3", 3),
  ];
  const s = latencyStats(turns);
  assert.equal(s.samples, 3);
  assert.ok(Math.abs(s.meanSeconds - 2.66) < 0.05, `mean first-word delay ~2.7s, got ${s.meanSeconds}`);
  assert.ok(s.uniformPattern, "3 near-uniform readings detected");
}

// Spread latency: 3 wildly different -> no uniform pattern.
{
  const turns = [
    turn("a", "q1", 1),
    turn("b", "q2", 7),
    turn("c", "q3", 13),
  ];
  assert.equal(latencyStats(turns).uniformPattern, false, "spread latency is normal");
}

// Plan-aware labels, with fallback when plan is missing.
{
  const plan = { questions: [{ id: "x1" }, { id: "x2" }] };
  assert.equal(questionLabel("x2", plan), "Q2");
  assert.equal(questionLabel("nope", plan), "nope");
  assert.equal(latencyStats([turn("a", "x1", 1)], plan).timings[0].questionLabel, "Q1");
}

// --- style shift ------------------------------------------------------------
{
  const prose = (i, start) => turn(String(i), `q${i}`, start, "just some normal plain prose here for the test");
  const md = (i, start) => turn(String(i), `q${i}`, start, "# Overview\n- point one\n\n```js\nconst x = 1\n```");
  const turns = [prose(1, 1), prose(2, 4), prose(3, 7), md(4, 10)];
  const sig = styleShiftSignal(turns);
  assert.ok(sig, "late markdown spike flagged");
  assert.equal(sig.type, "style_shift");
  assert.equal(sig.weight, "medium");
  assert.equal(styleShiftSignal([prose(1, 1), prose(2, 4), prose(3, 7)]), null, "fewer than 4 -> no signal");
  assert.equal(styleShiftSignal([prose(1, 1), prose(2, 3), prose(3, 5), prose(4, 7)]), null, "uniform style -> no signal");
}

// --- describeEvent ----------------------------------------------------------
assert.ok(describeEvent({ id: "", interviewId: "", turnId: null, type: "canary_triggered", payload: {}, ts: "" }).length > 0);
assert.equal(describeEvent({ id: "", interviewId: "", turnId: null, type: "gaze_sweep", payload: {}, ts: "" }), "");

// --- buildIntegrityReport ----------------------------------------------------
const ev = (type, ts, over = {}) => ({ id: "e", interviewId: "i1", turnId: null, type, payload: {}, ts, ...over });
{
  const r = buildIntegrityReport("i1", [], []);
  assert.equal(r.riskLevel, "low");
  assert.equal(r.totalSignals, 0);
  assert.equal(r.latency.samples, 0);
}
{
  // Canary fired -> high, single strongest signal.
  const r = buildIntegrityReport("i1", [turn("a", "q1", 1)], [
    ev("canary_triggered", "2026-01-01T00:00:03.000Z"),
  ]);
  assert.equal(r.riskLevel, "high");
  assert.equal(r.signals[0].weight, "high");
}
{
  // Three tab switches, no canary -> medium.
  const r = buildIntegrityReport("i1", [], [
    ev("tab_blur", "2026-01-01T00:00:01.000Z"),
    ev("tab_blur", "2026-01-01T00:00:02.000Z"),
    ev("tab_blur", "2026-01-01T00:00:03.000Z"),
  ]);
  assert.equal(r.riskLevel, "medium");
}
{
  // Uniform latency alone -> medium.
  const turns = [
    turn("a", "q1", 2),
    turn("b", "q2", 3),
    turn("c", "q3", 3),
  ];
  const r = buildIntegrityReport("i1", turns, []);
  assert.equal(r.riskLevel, "medium");
  assert.ok(r.signals.some((s) => s.type === "latency_variance"));
}
{
  // One stray paste -> low.
  const r = buildIntegrityReport("i1", [], [ev("paste_event", "2026-01-01T00:00:01.000Z")]);
  assert.equal(r.riskLevel, "low");
}

console.log("integrity checks passed");