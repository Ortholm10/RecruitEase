const LANG_HINTS: Record<string, string> = {
  react: "tsx",
  node: "typescript",
  sql: "sql",
  system: "text",
};

/**
 * The on-screen artifact for "artifact" questions. Recruiters post these as
 * code the candidate must read/explain — a copilot that scrapes chat text
 * can't see the screen, so this is the class-blind part of the interview.
 * Structured simply: big monospace block, no execution.
 */
export function ArtifactView({ payload, skill }: { payload: string; skill?: string }) {
  const hint = skill ? LANG_HINTS[skill.toLowerCase()] ?? undefined : undefined;
  return (
    <div className="overflow-x-auto rounded-lg bg-muted p-3">
      <pre
        data-language={hint}
        className="text-xs leading-relaxed whitespace-pre-wrap text-pretty tab-size-4"
      >
        {payload}
      </pre>
    </div>
  );
}