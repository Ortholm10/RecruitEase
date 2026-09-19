import type { Evidence } from "@/types";

// Typographic variants models (and PDF exports) swap in for plain ASCII.
const FOLD: Record<string, string> = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'",
  "“": '"', "”": '"', "„": '"', "‟": '"', "″": '"',
  "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-",
  "―": "-", "−": "-", "…": "...",
};

/** Lowercase, fold typographic punctuation and drop ALL whitespace, keeping
 *  for every output char the index of the source char it came from. Dropping
 *  (not just collapsing) whitespace also survives "rows,added" vs "rows, added"
 *  and words split across PDF line breaks. */
function loosen(s: string): { text: string; map: number[] } {
  let text = "";
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (/\s/.test(ch)) continue;
    const out = FOLD[ch] ?? ch.toLowerCase(); // may be >1 char ("…", "İ")
    for (const c of out) {
      text += c;
      map.push(i);
    }
  }
  return { text, map };
}

/** Strip what models wrap around a quote: outer quote marks, ellipses,
 *  trailing sentence punctuation. */
function clean(quote: string): string {
  return quote
    .trim()
    .replace(/^["'`‘’“”]+|["'`‘’“”]+$/g, "")
    .replace(/^(?:\.{3}|…)+|(?:\.{3}|…)+$/g, "")
    .replace(/[.,;:!?]+$/, "")
    .trim();
}

/**
 * Locate `quote` in `resumeText` and return character offsets into
 * resumeText. Exact match first, then a loose match. Never throws; if the
 * quote can't be located it comes back grounded:false with null offsets
 * so the UI can say so instead of dropping it.
 */
export function findQuote(resumeText: string, quote: string): Evidence {
  const ungrounded: Evidence = { quote, startOffset: null, endOffset: null, grounded: false };
  if (typeof resumeText !== "string" || typeof quote !== "string" || !quote.trim()) {
    return ungrounded;
  }

  const exact = resumeText.indexOf(quote);
  if (exact !== -1) {
    return { quote, startOffset: exact, endOffset: exact + quote.length, grounded: true };
  }

  const needle = loosen(clean(quote)).text;
  if (!needle) return ungrounded;
  const hay = loosen(resumeText);
  const at = hay.text.indexOf(needle);
  if (at === -1) return ungrounded;

  return {
    quote,
    startOffset: hay.map[at],
    endOffset: hay.map[at + needle.length - 1] + 1,
    grounded: true,
  };
}
