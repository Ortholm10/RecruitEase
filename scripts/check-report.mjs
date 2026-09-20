// Self-check for Phase 5 pure logic: answer grading (gradeTurn) and the
// Evaluation Report assembler (buildReport). No LLM or DB calls.
// Run: node scripts/check-report.mjs
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

const { gradeAnswer } = await import("@/lib/interview/gradeTurn");
const {
  buildEvaluationReport,
  movementBetween,
  postInterviewStrength,
  movementLabel,
  recommendOutcome,
} = await import("@/lib/report/buildReport");
const { VERDICT_POINTS } = await import("@/types/index");

// --- gradeAnswer -----------------------------------------------------------
assert.equal(gradeAnswer({ specificity: "specific", consistency: "consistent", transcript: "Built it at 500k rows/day." }), "strong");
assert.equal(gradeAnswer({ specificity: "generic", consistency: "consistent", transcript: "I did some react stuff." }), "partial");
assert.equal(gradeAnswer({ specificity: "specific", consistency: "contradictory", transcript: "Actually I only used Vue." }), "unproven");
assert.equal(gradeAnswer({ specificity: "generic", consistency: "consistent", transcript: "   " }), "absent", "empty transcript -> absent");
assert.equal(gradeAnswer({ specificity: "specific", consistency: "contradictory", transcript: "" }), "absent", "empty wins over contradiction");

// --- movement helpers ------------------------------------------------------
assert.equal(movementBetween("unproven", "strong"), "up");
assert.equal(movementBetween("strong", "partial"), "down");
assert.equal(movementBetween("strong", "strong"), "held");
assert.equal(movementBetween("strong", null), null);
assert.equal(postInterviewStrength("unproven", "strong"), VERDICT_POINTS.strong);
assert.equal(postInterviewStrength("strong", null), VERDICT_POINTS.strong, "resume-only evidence holds");
assert.equal(movementLabel("unproven", "strong"), "Unproven -> Strong");
assert.equal(movementLabel("strong", "strong"), null);
assert.equal(movementLabel("unproven", null), null);

// --- fixtures --------------------------------------------------------------
const requirements = [
  { id: "req_react", skill: "React", level: "senior", mustHave: true, weight: 0.4, rawText: "" },
  { id: "req_node", skill: "Node.js", level: "mid", mustHave: true, weight: 0.3, rawText: "" },
  { id: "req_sql", skill: "SQL", level: "mid", mustHave: false, weight: 0.2, rawText: "" },
  { id: "req_design", skill: "Design", level: "any", mustHave: false, weight: 0.1, rawText: "" },
];

const plan = {
  id: "i1",
  candidateId: "c1",
  jobId: "j1",
  generatedAt: "2026-01-01T00:00:00.000Z",
  questions: [
    { id: "q1", type: "gap_probe", requirementId: "req_node", prompt: "Node?", timeLimitSeconds: null },
    { id: "q2", type: "gap_probe", requirementId: "req_sql", prompt: "SQL?", timeLimitSeconds: null },
    { id: "q3", type: "resume_probe", requirementId: null, prompt: "Claim: \"X\" Question: Y", timeLimitSeconds: null },
    { id: "q4", type: "rapid_fire", requirementId: null, prompt: "Debounce?", timeLimitSeconds: 20 },
  ],
};

const breakdown = [
  { requirementId: "req_react", verdict: "strong", points: 1, evidence: { quote: "React 5yrs", startOffset: 0, endOffset: 10, grounded: true }, reasoning: "concrete" },
  { requirementId: "req_node", verdict: "partial", points: 0.5, evidence: null, reasoning: "limited" },
  { requirementId: "req_sql", verdict: "unproven", points: 0.25, evidence: { quote: "SQL", startOffset: 0, endOffset: 3, grounded: true }, reasoning: "mention only" },
  { requirementId: "req_design", verdict: "absent", points: 0, evidence: null, reasoning: "nothing" },
];

const T = (over = {}) => ({
  id: "t1",
  interviewId: "i1",
  questionId: "q1",
  questionType: "gap_probe",
  followUpDepth: 0,
  askedAt: "2026-01-01T00:00:01.000Z",
  firstWordAt: "2026-01-01T00:00:03.000Z",
  answeredAt: "2026-01-01T00:00:05.000Z",
  transcript: "text",
  verdict: "strong",
  evidenceLinkedRequirement: "req_node",
  ...over,
});

// --- report assembly -------------------------------------------------------
{
  const report = buildEvaluationReport({
    candidateId: "c1",
    jobId: "j1",
    interviewId: "i1",
    requirements,
    score: { breakdown },
    plan,
    turns: [
      T({ id: "a", questionId: "q1", verdict: "strong", transcript: "Built an event pipeline at 500k writes/day." }),
      T({ id: "b", questionId: "q1", followUpDepth: 1, questionType: "follow_up", verdict: "strong", transcript: "Third-node deploy with zero downtime." }),
      T({ id: "c", questionId: "q2", verdict: "unproven", transcript: "I know what an index is." }),
      T({ id: "d", questionId: "q3", verdict: "strong", transcript: "We shipped it in 3 weeks." }),
      T({ id: "e", questionId: "q4", verdict: "partial", transcript: "it debounces." }),
    ],
  });

  // Node: partial -> strong via the primary (and follow-up) interview answers.
  const node = report.rows.find((r) => r.requirementId === "req_node");
  assert.equal(node.interview.probed, true);
  assert.equal(node.interview.verdict, "strong");
  assert.equal(node.movement, "up");
  assert.equal(node.movementLabel, "Partial -> Strong");
  assert.equal(node.remainingGap, false);

  // SQL: unproven on resume, unproven after interview -> remains a gap.
  const sql = report.rows.find((r) => r.requirementId === "req_sql");
  assert.equal(sql.interview.verdict, "unproven");
  assert.equal(sql.movement, "held");
  assert.equal(sql.movementLabel, null);
  assert.equal(sql.remainingGap, true);
  assert.match(sql.gapReason, /Not demonstrated/);

  // React: strong on resume, never probed -> not a gap.
  const react = report.rows.find((r) => r.requirementId === "req_react");
  assert.equal(react.interview.probed, false);
  assert.equal(react.interview.verdict, null);
  assert.equal(react.movement, null);
  assert.equal(react.remainingGap, false, "resume-strong requirement is fine even unprobed");

  // Design: absent on resume, never probed -> gap.
  const design = report.rows.find((r) => r.requirementId === "req_design");
  assert.equal(design.remainingGap, true);
  assert.match(design.gapReason, /Not probed/);

  // Gap list = the non-strong rows.
  assert.deepEqual(report.gaps.map((g) => g.requirementId), ["req_sql", "req_design"]);

  // Outcome: React strong on resume + Node strong after interview (both
  // must-haves resolved) -> advance.
  assert.equal(report.outcome, "advance");
}

// --- outcome paths ----------------------------------------------------------
{
  // Must-have absent everywhere -> reject.
  const r1 = buildEvaluationReport({ candidateId: "c", jobId: "j", interviewId: "i", requirements, score: { breakdown }, plan, turns: [] });
  // req_node partial on resume, never probed -> pending (not resolved, not absent-everywhere).
  assert.equal(recommendOutcome(r1.rows), "pending");
  const rowsReject = [
    { mustHave: true, resumeVerdict: "strong", interview: { verdict: null } },
    { mustHave: true, resumeVerdict: "absent", interview: { verdict: "absent" } },
  ];
  assert.equal(recommendOutcome(rowsReject), "reject");
  const rowsAdvance = [
    { mustHave: true, resumeVerdict: "unproven", interview: { verdict: "strong" } },
    { mustHave: false, resumeVerdict: "absent", interview: { verdict: null } },
  ];
  assert.equal(recommendOutcome(rowsAdvance), "advance");
}

console.log("report checks passed");