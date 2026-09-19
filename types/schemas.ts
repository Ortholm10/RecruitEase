// ============================================================
// Zod schemas for LLM structured output. These describe what the
// MODEL returns — code then derives the types/index.ts shapes from
// them (ids, normalized weights, offsets, points are never trusted
// from the model).
// ============================================================

import { z } from "zod";

/** A2: one requirement as the model sees it. `id` and final weight are
 *  computed in code (lib/jd/parseRequirements.ts). */
export const requirementLLMSchema = z.object({
  skill: z.string().describe('Short skill name, e.g. "React", "SQL"'),
  level: z.enum(["junior", "mid", "senior", "any"]),
  mustHave: z.boolean(),
  weight: z
    .number()
    .describe("Relative importance 1-10; normalized in code afterwards"),
  rawText: z
    .string()
    .describe("The exact JD sentence/clause this requirement came from"),
});

/** A4: one extracted fact. Offsets come from findQuote(), not the model. */
export const extractedFieldLLMSchema = z.object({
  key: z
    .string()
    .describe('e.g. "name", "email", "skill:React", "experience:years", "education"'),
  value: z.string(),
  quote: z.string().describe("Verbatim text copied from the resume"),
});

/** A5: the model's judgment for one requirement. Points, offsets and
 *  gating are derived in code (lib/scoring/scoreCandidate.ts). */
export const requirementScoreLLMSchema = z.object({
  requirementId: z.string(),
  verdict: z.enum(["strong", "partial", "unproven", "absent"]),
  reasoning: z.string().describe("One line justification"),
  quote: z
    .string()
    .describe('Verbatim resume text supporting the verdict; "" if absent'),
});

// ------------------------------------------------------------
// A6 interview planning — the model proposes question DRAFTS;
// the fixed composition (2+2+1+2/3), ids, ordering and timed/canned
// values are ALL assigned in code (lib/interview/planInterview.ts).
// ------------------------------------------------------------

export const questionDraftLLMSchema = z.object({
  type: z.enum(["resume_probe", "gap_probe", "artifact", "rapid_fire"]),
  requirementId: z
    .string()
    .nullable()
    .describe(
      "One of the requirement ids provided above. Set for gap_probe; null otherwise",
    ),
  prompt: z
    .string()
    .describe("The question, second person, 1-3 sentences, no numbering or preamble"),
  artifactPayload: z
    .string()
    .nullable()
    .optional()
    .describe("Leave null — the artifact snippet is supplied by the application"),
  timeLimitSeconds: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe("Leave null — the application enforces 20s for rapid_fire"),
});

export const questionDraftsLLMSchema = z.object({
  drafts: z
    .array(questionDraftLLMSchema)
    .min(6)
    .max(14)
    .describe(
      "A pool of candidate question drafts. The application selects and orders the final interview, so no draft is guaranteed inclusion.",
    ),
});

// ------------------------------------------------------------
// A7 answer classification — one judgment per answer, on two axes.
// Everything after this (follow-up caps, advancing, completion) is
// decided in code. The model never says "advance" or "ask a follow-up".
// ------------------------------------------------------------

export const answerClassificationLLMSchema = z.object({
  specificity: z
    .enum(["specific", "generic"])
    .describe(
      '"specific" = concrete detail: real numbers, names, outcomes, implementation choices. "generic" = vague, no concrete anchor.',
    ),
  consistency: z
    .enum(["consistent", "contradictory"])
    .describe(
      '"contradictory" when the answer conflicts with the stored resume claim being probed; "consistent" otherwise.',
    ),
  followUpPrompt: z
    .string()
    .nullable()
    .describe(
      "A short second-person follow-up question, only if a follow-up is useful: ask for the concrete detail when the answer is generic, or politely ask to reconcile the conflict when contradictory. null when no follow-up is useful. Never restate the original question.",
    ),
});
