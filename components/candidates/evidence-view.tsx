"use client";

import { useState } from "react";
import { LocateFixed, OctagonAlert, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VERDICTS, VERDICT_ORDER, VerdictBadge } from "@/components/verdict-badge";
import { cn } from "@/lib/utils";
import type { Candidate, Evidence, Requirement, RequirementScore, Score } from "@/types";

type Row = { b: RequirementScore; r: Requirement | undefined };

/** Offsets are only trusted if findQuote grounded them AND they still fit the
 *  stored resume text (it could have been re-extracted since scoring). */
function span(e: Evidence | null, text: string): { start: number; end: number } | null {
  if (!e?.grounded || e.startOffset === null || e.endOffset === null) return null;
  if (e.startOffset < 0 || e.endOffset > text.length || e.startOffset >= e.endOffset) return null;
  return { start: e.startOffset, end: e.endOffset };
}

function scrollIntoView(el: HTMLElement | null) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
}

export function EvidenceView({
  requirements,
  candidate,
  score,
}: {
  requirements: Requirement[];
  candidate: Candidate;
  score: Score;
}) {
  // n re-keys the <mark> so re-clicking the same quote scrolls to it again.
  const [selected, setSelected] = useState<{ id: string; n: number } | null>(null);
  const text = candidate.resumeText;

  const reqById = new Map(requirements.map((r) => [r.id, r]));
  const rows: Row[] = score.breakdown.map((b) => ({ b, r: reqById.get(b.requirementId) }));
  const failedGate = rows.filter((x) => x.r?.mustHave && x.b.verdict === "absent");
  const current = rows.find((x) => x.b.requirementId === selected?.id);
  const highlight = current ? span(current.b.evidence, text) : null;

  function select(id: string) {
    setSelected((s) => ({ id, n: (s?.n ?? 0) + 1 }));
  }

  // Share of the total weight held by each verdict (weights as currently stored).
  const totalWeight = rows.reduce((s, x) => s + (x.r?.weight ?? 0), 0);
  const byVerdict = VERDICT_ORDER.map((v) => {
    const matching = rows.filter((x) => x.b.verdict === v);
    const weight = matching.reduce((s, x) => s + (x.r?.weight ?? 0), 0);
    return { v, count: matching.length, share: totalWeight > 0 ? weight / totalWeight : 0 };
  }).filter((x) => x.count > 0);

  return (
    <>
      {score.mustHaveGateFailed && (
        <section
          aria-labelledby="gate-heading"
          className="flex gap-4 rounded-xl border-2 border-verdict-absent bg-verdict-absent/10 p-5"
        >
          <OctagonAlert aria-hidden className="size-7 shrink-0 text-verdict-absent" />
          <div className="flex flex-col gap-2">
            <h2 id="gate-heading" className="text-lg font-semibold">
              Must-have gate failed
            </h2>
            <p className="text-sm text-pretty">
              {score.gateReason}. The resume shows no evidence for a hard requirement, so this candidate
              doesn&apos;t qualify regardless of the total score.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {failedGate.map(({ b, r }) => (
                <Button
                  key={b.requirementId}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    select(b.requirementId);
                    scrollIntoView(document.getElementById(`req-${b.requirementId}`));
                  }}
                >
                  Review {r?.skill ?? b.requirementId}
                </Button>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="score-heading" className="rounded-xl border bg-card p-5">
            <h2 id="score-heading" className="text-sm font-medium text-muted-foreground">
              Resume score
            </h2>
            <p className="mt-1 flex items-baseline gap-1.5">
              <span className="text-5xl font-semibold tracking-tight">{score.total}</span>
              <span className="text-muted-foreground">/ 100</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground text-pretty">
              Weighted by requirement importance.{" "}
              {score.unproven.length > 0 &&
                `${score.unproven.length} partial or unproven requirement${score.unproven.length === 1 ? "" : "s"} to probe in the interview.`}
            </p>

            <div aria-hidden className="mt-5 flex h-3 gap-0.5">
              {byVerdict.map(({ v, share }) => (
                <div
                  key={v}
                  title={`${VERDICTS[v].label}: ${Math.round(share * 100)}% of weight`}
                  className={cn("h-full rounded-sm", VERDICTS[v].fill)}
                  style={{ width: `${share * 100}%` }}
                />
              ))}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Requirements by verdict">
              {byVerdict.map(({ v, count, share }) => {
                const { label, icon: Icon, iconClass } = VERDICTS[v];
                return (
                  <li key={v} className="flex items-center gap-1.5">
                    <Icon aria-hidden className={cn("size-4", iconClass)} />
                    <span className="font-medium">{label}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {count} · {Math.round(share * 100)}% of weight
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="req-heading" className="flex flex-col gap-3">
            <h2 id="req-heading" className="font-semibold">
              Evidence by requirement
            </h2>
            <ol className="flex flex-col gap-3">
              {rows.map(({ b, r }) => {
                const isSelected = selected?.id === b.requirementId;
                const located = span(b.evidence, text);
                return (
                  <li
                    key={b.requirementId}
                    id={`req-${b.requirementId}`}
                    className={cn(
                      "scroll-mt-6 rounded-xl border bg-card p-4 transition-shadow duration-150",
                      isSelected && "ring-2 ring-ring",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-medium">{r?.skill ?? b.requirementId}</h3>
                        <p className="text-xs text-muted-foreground">
                          {r
                            ? [r.mustHave && "Must-have", r.level !== "any" && `${r.level} level`, `${Math.round(r.weight * 100)}% of score`]
                                .filter(Boolean)
                                .join(" · ")
                            : "No longer on this job's requirements"}
                        </p>
                      </div>
                      <VerdictBadge verdict={b.verdict} />
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground text-pretty">{b.reasoning}</p>

                    {b.evidence === null ? (
                      <p className="mt-3 text-sm text-muted-foreground">No supporting text in the resume.</p>
                    ) : located ? (
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        aria-controls="resume-text"
                        onClick={() => select(b.requirementId)}
                        className="mt-3 flex w-full items-start gap-2.5 rounded-lg bg-muted/60 p-3 text-left text-sm transition-colors duration-150 hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        <LocateFixed aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                          <q className="text-pretty">{b.evidence.quote}</q>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {isSelected ? "Highlighted in resume" : "Show in resume"}
                          </span>
                        </span>
                      </button>
                    ) : (
                      <div className="mt-3 rounded-lg border border-dashed p-3 text-sm">
                        {b.evidence.quote ? (
                          <q className="text-pretty">{b.evidence.quote}</q>
                        ) : (
                          <span className="text-muted-foreground">The model gave no quote for this verdict.</span>
                        )}
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium">
                          <TriangleAlert aria-hidden className="size-3.5 shrink-0 text-verdict-partial" />
                          Couldn&apos;t verify exact location in the resume
                        </p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        </div>

        <section
          aria-labelledby="resume-heading"
          className="min-w-0 rounded-xl border bg-card lg:sticky lg:top-6"
        >
          <div className="flex items-baseline justify-between gap-3 border-b px-4 py-3">
            <h2 id="resume-heading" className="font-semibold">
              Resume
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              {current
                ? highlight
                  ? `Evidence for ${current.r?.skill ?? current.b.requirementId}`
                  : `No located evidence for ${current.r?.skill ?? current.b.requirementId}`
                : "Select a quote to locate it"}
            </p>
          </div>
          <pre
            id="resume-text"
            className="max-h-[70vh] overflow-auto p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap"
          >
            {highlight && current ? (
              <>
                {text.slice(0, highlight.start)}
                <mark
                  key={selected?.n}
                  ref={scrollIntoView}
                  className={cn(
                    "rounded-sm text-foreground box-decoration-clone",
                    VERDICTS[current.b.verdict].mark,
                  )}
                >
                  {text.slice(highlight.start, highlight.end)}
                </mark>
                {text.slice(highlight.end)}
              </>
            ) : (
              text
            )}
          </pre>
        </section>
      </div>
    </>
  );
}
