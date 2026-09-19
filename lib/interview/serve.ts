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

/**
 * Storage-free reconstruction of the current position from answered turns.
 * Used by the state endpoint when resuming a mid-interview reload. A parent
 * whose deepest answered turn is below the cap is presumed to have an open
 * follow-up chain; a fully-capped parent (depth 2 answered) is exhausted.
 * The live follow-up prompt normally travels in localStorage (the room saves
 * it when a follow-up is served), so this is the fallback shape.
 */
export function reconstructPosition(
  plan: InterviewPlan,
  answered: { questionId: string; followUpDepth: number }[],
): { parentIndex: number; depth: number } | null {
  const byParent = new Map<string, number[]>();
  for (const t of answered) {
    const depths = byParent.get(t.questionId) ?? [];
    depths.push(t.followUpDepth);
    byParent.set(t.questionId, depths);
  }
  for (let i = 0; i < plan.questions.length; i++) {
    const depths = byParent.get(plan.questions[i].id) ?? [];
    if (depths.length === 0) return { parentIndex: i, depth: 0 };
    const maxDepth = Math.max(...depths);
    if (maxDepth < MAX_FOLLOW_UP_DEPTH) return { parentIndex: i, depth: maxDepth + 1 };
  }
  return null;
}