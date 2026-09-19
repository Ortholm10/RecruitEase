import type { ExtractedField, Requirement, Verdict } from "@/types";

// ------------------------------------------------------------
// Canned artifact snippets. Building these in code (rather than asking the
// model for them) guarantees the payload is valid, syntactically plausible
// and matched to the question. A canned-but-relevant artifact beats a
// hallucinated one; pick per JD core-stack family.
// ------------------------------------------------------------

type Artifact = { code: string; prompt: string };

const REACT: Artifact[] = [
  {
    code: `function Compare({ items }) {
  const [sorted, setSorted] = useState(items);

  useEffect(() => {
    setSorted([...items].sort((a, b) => a.score - b.score));
  }, [items]);

  return <ol>{sorted.map((i) => <li key={i.id}>{i.name}</li>)}</ol>;
}`,
    prompt:
      "Read this component. Walk me through what is wrong with how it re-sorts the list, why the effect refires on every parent render, and how you would fix it.",
  },
  {
    code: `function useDebounced(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}`,
    prompt:
      "Read this hook out loud. What does it do, when does the effect run, and what guarantee does the cleanup function buy you? What is one way to misuse it?",
  },
];

const NODE: Artifact[] = [
  {
    code: `async function loadDashboard(userId: string) {
  const [profile, orders, teams] = await Promise.all([
    db.users.fetch(userId),
    db.orders.list(userId),
    db.teams.list(userId),
  ]);
  return { profile, orders, teams };
}`,
    prompt:
      "This endpoint fails entirely when any one of the three data sources is down, even though the other two are fine. Walk me through why, and how you would change it so partial results can still be returned.",
  },
  {
    code: `type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "square"; side: number };

function area(shape: Shape): number {
  switch (shape.kind) {
    case "circle":  return Math.PI * shape.radius ** 2;
    case "square":  return shape.side ** 2;
    default:        return assertNever(shape);
  }
}`,
    prompt:
      "Explain what the assertNever helper must look like, what guarantee writing it gives the compiler, and what happens when someone later adds a new kind of Shape.",
  },
];

const SQL: Artifact[] = [
  {
    code: `SELECT o.id, o.total, c.email
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE c.acquired_at > '2024-01-01'
ORDER BY o.created_at DESC;`,
    prompt:
      "This query is fast in staging but slow in production on a customers table with millions of rows. Walk me through the index strategy you would use to make it fast, and why each index helps.",
  },
  {
    code: `SELECT customer_id, COUNT(*) AS order_count
FROM orders
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY customer_id
HAVING COUNT(*) > 5
ORDER BY order_count DESC;`,
    prompt:
      "Explain in plain English what this query computes, and then describe the exact index you would create to make it fast at scale.",
  },
];

const SYSTEM_DESIGN: Artifact[] = [
  {
    code: `// Upload flow before refactor
export async function handler(req: Request) {
  const file = await req.blob();         // 1. read whole file into memory
  const url = await storage.put(file);   // 2. upload
  db.asset.insert({ url });              // 3. persist
  return json({ url });
}`,
    prompt:
      "This upload handler caps out around 50 MB. Walk me through which stages are memory-bound, and how you would redesign this flow to handle multi-gigabyte uploads.",
  },
];

const FAMILIES: Record<string, Artifact[]> = {
  react: REACT,
  node: NODE,
  sql: SQL,
  system: SYSTEM_DESIGN,
};

/** Pick a family by scanning the JD's extracted skill names. Core stack
 *  families take priority; anything left over lands in system design. */
export function pickArtifactSkillFamily(skills: string[]): keyof typeof FAMILIES {
  const hay = skills.join(" ").toLowerCase();
  if (/react|frontend|hooks/.test(hay)) return "react";
  if (/node|typescript|express|backend|rest|graphql/.test(hay)) return "node";
  if (/sql|postgres|relational|database/.test(hay)) return "sql";
  return "system";
}

/** Deterministic selection within the family so the same candidate always
 *  gets the same artifact (no plan drift between refreshes). */
export function pickArtifact(skills: string[], salt: string): Artifact {
  const family = pickArtifactSkillFamily(skills);
  const pool = FAMILIES[family];
  let hash = 0;
  for (let i = 0; i < salt.length; i++) hash = (hash * 31 + salt.charCodeAt(i)) >>> 0;
  return pool[hash % pool.length];
}

// ------------------------------------------------------------
// Code-built prompt templates (fallbacks when a model draft is unusable).
// Follow-up prompts are deliberately deterministic so the recruiter
// transcript view can always reconstruct what was asked.
// ------------------------------------------------------------

/** Fallback rapid-fire prompts when the model returns too few usable ones. */
export const FALLBACK_RAPID_FIRE = [
  "Without naming tools, walk me through how you'd diagnose a page that loads fine locally but slowly in production.",
  "Your teammate pushes a delete endpoint with no auth or validation. What do you do first, and why?",
  "In under two sentences, describe the hardest bug you've fixed in the last year and what actually caused it.",
];

export function probePromptForField(field: ExtractedField): string {
  return `Your resume says: "${field.evidence.quote}". Walk me through that specific piece of work — what you personally built, how, and what the outcome was.`;
}

export function gapProbePrompt(
  requirement: Requirement,
  verdict: Verdict,
  quote: string | null,
): string {
  const shown = verdict === "unproven" ? "mentions this skill but nothing concrete backs it up" : "didn't fully back this up";
  const quoteText = quote ? ` Your resume says: "${quote}".` : "";
  return `Scoring marked ${requirement.skill} as ${verdict}: your resume ${shown}.${quoteText} Walk me through a concrete project where you actually used it — what you built, your specific role, and the result.`;
}

/** Follow-up after a generic answer — ask for the concrete detail. */
export function concretenessFollowUp(): string {
  return "That was a bit general. Give me the concrete details — what were the actual figures, timeline, or measurable outcome, and what specifically did you do?";
}

/** Follow-up after a contradictory answer — politely reconcile, grounding
 *  in the actual stored resume claim. */
export function reconcileFollowUp(resumeQuote: string): string {
  return `Interesting — your resume says: "${resumeQuote}". That doesn't quite line up with what you just described. Help me reconcile the two — which is accurate, and why?`;
}