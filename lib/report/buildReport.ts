import { VERDICT_POINTS } from "@/types";
import type {
  EvaluationReport,
  InterviewPlan,
  Movement,
  Requirement,
  RequirementEvaluationRow,
  RequirementScore,
  Turn,
  Verdict,
} from "@/types";

/**
 * Phase 5 — assembles the Recruiter Evaluation Report (B8 &apos;money screen&apos;)
 * from data that already exists: the resume Score (pre-interview evidence)
 * and the answered Interview turns (post-interview evidence). Pure and
 * deterministic — no LLM call, no DB write — so it is unit-tested in
 * scripts/check-report.mjs and safe to render on every page load.
 *
 * Evidence mapping is exact: a requirement&apos;s interview evidence is the turn
 * chain (parent + follow-ups) of the planned questions that targeted it (the
 * gap probes carry requirementId). Requirements that were never probed, or
 * probed but not demonstrated strong, land in `gaps` with a human reason.
 */
export function buildEvaluationReport(opts: {
  candidateId: string;
  jobId: string;
  interviewId: string;
  requirements: Requirement[];
  score: Pick<ScoreLike, "breakdown"> | RequirementScoreList;
  plan: InterviewPlan;
  turns: Turn[];
  createdAt?: string;
}): EvaluationReport {
  const scoreBreakdown: RequirementScore[] =
    "breakdown" in opts.score ? opts.score.breakdown : opts.score;

  // Map every planned question id to the requirement it probes (only gap
  // probes carry requirementId; resume_probe/rapid_fire/artifact are skill
  // checks with no single-requirement attribution).
  const requirementOfQuestion = new Map<string, string | null>();
  for (const q of opts.plan.questions) {
    requirementOfQuestion.set(q.id, q.requirementId ?? null);
  }

  const answered = opts.turns
    .filter((t) => t.answeredAt !== null)
    .sort((a, b) => a.askedAt.localeCompare(b.askedAt));

  const scoreByRequirement = new Map<string, RequirementScore>();
  for (const b of scoreBreakdown) scoreByRequirement.set(b.requirementId, b);

  const rows: RequirementEvaluationRow[] = opts.requirements.map((r) => {
    const resume = scoreByRequirement.get(r.id);
    const resumeVerdict: Verdict = resume?.verdict ?? "absent";

    const linked = answered.filter(
      (t) => requirementOfQuestion.get(t.questionId) === r.id && t.verdict !== null,
    );

    // Primary interview evidence = the shallowest answered turn for the
    // chain (the candidate&apos;s own first answer, before any follow-up push).
    const primary = linked.reduce<Turn | null>(
      (best, t) => (best === null || t.followUpDepth < best.followUpDepth ? t : best),
      null,
    );
    const probed = linked.length > 0;
    const interviewVerdict: Verdict | null = primary?.verdict ?? null;

    const movement = movementBetween(resumeVerdict, interviewVerdict);
    const combined = postInterviewStrength(resumeVerdict, interviewVerdict);
    const remainingGap = combined < STRONG_POINTS
      || (r.mustHave && combined < STRONG_POINTS);

    return {
      requirementId: r.id,
      skill: r.skill,
      level: r.level,
      mustHave: r.mustHave,
      weight: r.weight,
      resumeVerdict,
      resumeQuote: resume?.evidence?.quote ?? null,
      resumeReasoning: resume?.reasoning ?? "",
      interview: {
        probed,
        verdict: interviewVerdict,
        turns: linked,
      },
      movement,
      movementLabel: movementLabel(resumeVerdict, interviewVerdict),
      remainingGap,
      gapReason: gapReasonFor(r, resumeVerdict, interviewVerdict, probed),
    };
  });

  const gaps = rows.filter((r) => r.remainingGap);

  return {
    candidateId: opts.candidateId,
    jobId: opts.jobId,
    interviewId: opts.interviewId,
    rows,
    gaps,
    outcome: recommendOutcome(rows),
    createdAt: opts.createdAt ?? new Date().toISOString(),
  };
}

// Verdict "strength" numbers live in types/index.ts; keep the strong-points
// boundary here so a missing requirement can never appear resolved.
const STRONG_POINTS = VERDICT_POINTS.strong;

type ScoreLike = { breakdown: RequirementScore[] };
type RequirementScoreList = RequirementScore[];

/** Compare resume vs interview verdict. null when there is no interview
 *  evidence to compare against. */
export function movementBetween(
  resume: Verdict,
  interview: Verdict | null,
): Movement {
  if (interview === null) return null;
  const a = VERDICT_POINTS[resume];
  const b = VERDICT_POINTS[interview];
  if (b > a) return "up";
  if (b < a) return "down";
  return "held";
}

/** Total strength AFTER both sources: the stronger of the two verdicts. */
export function postInterviewStrength(
  resume: Verdict,
  interview: Verdict | null,
): number {
  if (interview === null) return VERDICT_POINTS[resume];
  return Math.max(VERDICT_POINTS[resume], VERDICT_POINTS[interview]);
}

/** e.g. "Unproven -> Strong". null when there is no interview verdict. */
export function movementLabel(resume: Verdict, interview: Verdict | null): string | null {
  if (interview === null) return null;
  if (interview === resume) return null;
  return `${present(resume)} -> ${present(interview)}`;
}

function present(v: Verdict): string {
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function gapReasonFor(
  r: Requirement,
  resume: Verdict,
  interview: Verdict | null,
  probed: boolean,
): string | null {
  const strong = VERDICT_POINTS[resume] >= STRONG_POINTS || (interview !== null && VERDICT_POINTS[interview] >= STRONG_POINTS);
  if (strong) return null;
  if (interview === null) {
    return probed
      ? "Probed but not demonstrated — no usable answer was recorded."
      : "Not probed in the interview.";
  }
  if (interview === "unproven" || interview === "absent") {
    return `Not demonstrated in the interview (${present(interview)}).`;
  }
  if (resume === "unproven" || resume === "absent") {
    return `${present(resume)} on the resume, only ${present(interview)} in the interview.`;
  }
  return `${present(resume)} on the resume and ${present(interview)} in the interview.`;
}

/** Outcome based on what is left after the interview:
 *  advance = every must-have is strong on at least one source;
 *  reject  = a must-have is absent on both sources;
 *  pending = anything not decided above. */
export function recommendOutcome(rows: Pick<RequirementEvaluationRow, "mustHave" | "resumeVerdict" | "interview">[]): "advance" | "reject" | "pending" {
  const mustHaves = rows.filter((r) => r.mustHave);
  if (mustHaves.length === 0) return "pending";
  const allResolved = mustHaves.every(
    (r) =>
      VERDICT_POINTS[r.resumeVerdict] >= STRONG_POINTS ||
      (r.interview.verdict !== null && VERDICT_POINTS[r.interview.verdict] >= STRONG_POINTS),
  );
  if (allResolved) return "advance";
  const anyAbsentEverywhere = mustHaves.some(
    (r) => r.resumeVerdict === "absent" && r.interview.verdict === "absent",
  );
  return anyAbsentEverywhere ? "reject" : "pending";
}