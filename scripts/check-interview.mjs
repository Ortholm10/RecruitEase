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

// --- serve.ts: position reconstruction -----------------------------------
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

assert.deepEqual(reconstructPosition(plan, []), { parentIndex: 0, depth: 0 });
assert.deepEqual(reconstructPosition(plan, [{ questionId: "q1", followUpDepth: 0 }]), { parentIndex: 0, depth: 1 });
assert.deepEqual(reconstructPosition(plan, [{ questionId: "q1", followUpDepth: 0 }, { questionId: "q1", followUpDepth: 1 }]), { parentIndex: 0, depth: 2 });
assert.deepEqual(reconstructPosition(plan, [{ questionId: "q1", followUpDepth: 0 }, { questionId: "q1", followUpDepth: 1 }, { questionId: "q1", followUpDepth: 2 }]), { parentIndex: 1, depth: 0 }, "capped parent advances");
assert.deepEqual(reconstructPosition(plan, [{ questionId: "q1", followUpDepth: 2 }, { questionId: "q2", followUpDepth: 2 }]), null, "every parent exhausted -> done");

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