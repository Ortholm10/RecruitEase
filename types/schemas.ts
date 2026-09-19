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
