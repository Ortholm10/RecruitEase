import type { Verdict } from "@/types";

/**
 * Phase 5 — interview answer grading on the SAME 4-point scale as resume
 * scoring, so a report can show movement ("Unproven on paper, Strong in the
 * interview"). The classifier already emits two axes (specificity,
 * consistency); the verdict is DERIVED here in code, never trusted from a
 * model field, so an LLM that only answers the axes still grades:
 *
 *   contradictory   -> "unproven"  An answer that conflicts with a stored
 *                                  resume claim undercuts that claim — until
 *                                  reconciled, the evidence is unproven.
 *   specific+consistent -> "strong" Concrete, non-conflicting detail.
 *   generic+consistent  -> "partial" Real but vague.
 *   empty transcript    -> "absent"  Nothing was answered at all.
 */
export function gradeAnswer(opts: {
  specificity: "specific" | "generic";
  consistency: "consistent" | "contradictory";
  transcript: string;
}): Verdict {
  if (opts.transcript.trim().length === 0) return "absent";
  if (opts.consistency === "contradictory") return "unproven";
  return opts.specificity === "specific" ? "strong" : "partial";
}