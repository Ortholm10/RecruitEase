import type { InterviewPlan, PlannedQuestion, ServedQuestion } from "@/types";

// Hard caps, enforced in code on every answer request. NOT configurable per
// question — a followUpDepth=2 answer never triggers another follow-up, and
// the interview ends after MAX_TURNS answered turns no matter what.
export const MAX_FOLLOW_UP_DEPTH = 2;
export const MAX_TURNS = 14;

/** The very first question of an interview, served at `now`. */
export function firstServedQuestion(plan: InterviewPlan, now: string): ServedQuestion {
  const q = plan.questions[0];
  if (!q) throw new ApiServeError("This interview plan has no questions.");
  return { ...q, followUpDepth: 0, servedAt: now };
}

export class ApiServeError extends Error {}

/** Index of a planned question by id, or -1. */
export function planIndexOf(plan: InterviewPlan, questionId: string): number {
  return plan.questions.findIndex((q) => q.id === questionId);
}

/** Build the next served question (a follow-up) from its parent. */
export function buildFollowUp(
  parent: PlannedQuestion,
  followUpDepth: number,
  prompt: string,
  now: string,
): ServedQuestion {
  return {
    id: parent.id,
    type: "follow_up",
    requirementId: parent.requirementId,
    prompt,
    timeLimitSeconds: null,
    followUpDepth,
    servedAt: now,
  };
}

/** Build the served planned question at `index`, or null past the end. */
export function buildPlanned(plan: InterviewPlan, index: number, now: string): ServedQuestion | null {
  const q = plan.questions[index];
  if (!q) return null;
  return { ...q, followUpDepth: 0, servedAt: now };
}

export type AnsweredTurn = {
  questionId: string;
  followUpDepth: number;
  /** false while the follow-up has been SERVED but not answered (the room is
   *  sitting on it); true once answered_at is set. */
  answered: boolean;
  /** The exact prompt that was served for an un-answered follow-up. Lives in
   *  evidence_linked_requirement on the served (pre-answer) turn row. Planned
   *  questions carry null — their prompt is in the plan. */
  prompt: string | null;
  /** When the in-flight follow-up was served (asked_at). */
  servedAt: string | null;
};

export type ReconstructedPosition = {
  parentIndex: number;
  depth: number;
  prompt: string | null;
  servedAt: string | null;
};

/** Exact reconstruction of the live position from turn rows, used by the
 *  state endpoint. No guessing:
 *   - an UNSERVED-GAP marker does not exist; instead every served follow-up is
 *     persisted up-front as a turn row with answered_at null, so this simply
 *     returns it (with its exact prompt) when one is in flight;
 *   - otherwise the last answered turn means "that question is done, next
 *     planned question up" — a parent whose answer advanced past follow-ups
 *     moves on, so a reload can never resurrect a phantom follow-up.
 *  Callers must pass turns ordered by asked_at ascending. */
export function reconstructPosition(
  plan: InterviewPlan,
  turns: AnsweredTurn[],
): ReconstructedPosition | null {
  if (turns.length === 0) return { parentIndex: 0, depth: 0, prompt: null, servedAt: null };

  const inFlight = [...turns].reverse().find((t) => !t.answered);
  if (inFlight) {
    const parentIndex = planIndexOf(plan, inFlight.questionId);
    if (parentIndex === -1) return null;
    return {
      parentIndex,
      depth: inFlight.followUpDepth,
      prompt: inFlight.prompt,
      servedAt: inFlight.servedAt ?? null,
    };
  }

  const lastAnswered = turns[turns.length - 1];
  const parentIndex = planIndexOf(plan, lastAnswered.questionId);
  if (parentIndex === -1) return null;
  const next = parentIndex + 1;
  if (next >= plan.questions.length) return null;
  return { parentIndex: next, depth: 0, prompt: null, servedAt: null };
}