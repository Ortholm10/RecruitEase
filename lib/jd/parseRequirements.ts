import { z } from "zod";
import { generateStructured } from "@/lib/ai/client";
import { requirementLLMSchema } from "@/types/schemas";
import type { Requirement } from "@/types";

type LLMRequirement = z.infer<typeof requirementLLMSchema>;

const SYSTEM = `You extract assessable hiring requirements from a job description.
Rules:
- One requirement per bullet/clause in the requirements and nice-to-have sections. Do not split one bullet into several requirements, and ignore "what you'll do" responsibilities, company info and benefits (unless the JD has no requirements section at all).
- skill: a short label (1-4 words), e.g. "React", "Node.js/TypeScript", "SQL & relational databases", "Professional experience".
- level: the seniority expected for that skill. "senior" for strong/deep/expert/at-scale, "mid" for proficient/solid/working knowledge, "junior" for familiarity/exposure/basic, "any" when unspecified.
- mustHave: true ONLY when the JD explicitly marks it as must-have / mandatory / required / non-negotiable. Everything else is false.
- weight: relative importance from 1 to 10. Must-haves 8-10, other core requirements 4-7, nice-to-haves 1-3.
- rawText: copy the JD sentence/clause verbatim.`;

export async function parseRequirements(jdText: string): Promise<Requirement[]> {
  const { object } = await generateStructured({
    schema: z.object({ requirements: z.array(requirementLLMSchema) }),
    system: SYSTEM,
    prompt: `Job description:\n"""\n${jdText}\n"""`,
  });
  return toRequirements(object.requirements);
}

function slugify(s: string): string {
  const slug = s
    .toLowerCase()
    .replace(/\+/g, "plus")
    .replace(/#/g, "sharp")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "skill";
}

/** Code-side derivation: stable ids from skill+level, weights normalized to sum to 1. */
export function toRequirements(raw: LLMRequirement[]): Requirement[] {
  if (raw.length === 0) {
    throw new Error("The model found no requirements in this job description.");
  }
  const weights = raw.map((r) => (Number.isFinite(r.weight) && r.weight > 0 ? r.weight : 0));
  const sum = weights.reduce((a, b) => a + b, 0);
  const seen = new Map<string, number>();

  return raw.map((r, i) => {
    const base = `req_${slugify(r.skill)}_${r.level}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return {
      id: n === 1 ? base : `${base}_${n}`,
      skill: r.skill.trim(),
      level: r.level,
      mustHave: r.mustHave,
      weight: sum > 0 ? weights[i] / sum : 1 / raw.length,
      rawText: r.rawText.trim(),
    };
  });
}
