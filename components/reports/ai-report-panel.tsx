"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CandidateAiSummary, JobAiSummary, ReportOutcome } from "@/types";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "done"; data: JobAiSummary }
  | { status: "error"; message: string };

const RECOMMENDATION_STYLE: Record<ReportOutcome, string> = {
  advance: "bg-emerald-500/15 text-emerald-300",
  reject: "bg-rose-500/15 text-rose-300",
  pending: "bg-amber-500/15 text-amber-300",
};

function ScoreBar({ candidates }: { candidates: CandidateAiSummary[] }) {
  const sorted = [...candidates].sort((a, b) => b.aiScore - a.aiScore);
  return (
    <div className="rounded-xl border border-white/10 bg-card/60 p-5">
      <h3 className="font-semibold">AI fit score</h3>
      <p className="text-xs text-muted-foreground">Every scored candidate for this job, 1-100</p>
      <div className="relative mt-8 flex h-48 items-end gap-3">
        <div
          aria-hidden
          className="absolute right-0 left-0 border-t border-dashed border-white/20"
          style={{ bottom: "60%" }}
        />
        {sorted.map((c) => (
          <div key={c.candidateId} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-xs font-medium tabular-nums">{c.aiScore}</span>
            <div className="flex w-full flex-1 items-end">
              <div
                className={cn(
                  "w-full rounded-t-md bg-gradient-to-t",
                  c.recommendation === "reject"
                    ? "from-rose-600 to-rose-400"
                    : c.recommendation === "advance"
                      ? "from-emerald-600 to-emerald-400"
                      : "from-amber-600 to-amber-400",
                )}
                style={{ height: `${Math.max(c.aiScore, 2)}%` }}
              />
            </div>
            <span className="w-full truncate text-center text-[11px] text-muted-foreground">
              {c.name.split(" ")[0]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecommendationDonut({ candidates }: { candidates: CandidateAiSummary[] }) {
  const r = 60;
  const c = 2 * Math.PI * r;
  const total = candidates.length;
  const counts: Record<ReportOutcome, number> = { advance: 0, pending: 0, reject: 0 };
  for (const cand of candidates) counts[cand.recommendation]++;
  const segments: { key: ReportOutcome; className: string }[] = [
    { key: "advance", className: "stroke-emerald-400" },
    { key: "pending", className: "stroke-amber-400" },
    { key: "reject", className: "stroke-rose-400" },
  ];
  let offset = 0;

  return (
    <div className="rounded-xl border border-white/10 bg-card/60 p-5">
      <h3 className="font-semibold">Recommendation</h3>
      <p className="text-xs text-muted-foreground">AI outcome distribution</p>
      <div className="relative mt-4 flex items-center justify-center">
        <svg viewBox="0 0 140 140" className="size-40 -rotate-90">
          <circle cx="70" cy="70" r={r} fill="none" stroke="currentColor" strokeWidth="14" className="text-white/10" />
          {total > 0 &&
            segments.map((s) => {
              const value = counts[s.key];
              if (value === 0) return null;
              const len = (value / total) * c;
              const el = (
                <circle
                  key={s.key}
                  cx="70"
                  cy="70"
                  r={r}
                  fill="none"
                  strokeWidth="14"
                  className={s.className}
                  strokeDasharray={`${len} ${c - len}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })}
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-2xl font-semibold">{total ? Math.round((counts.advance / total) * 100) : 0}%</span>
          <span className="text-[11px] text-muted-foreground">Advance</span>
        </div>
      </div>
      <ul className="mt-4 flex flex-col gap-1.5 text-xs">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 capitalize">
              <span className={cn("size-2 rounded-full", s.className.replace("stroke-", "bg-"))} />
              {s.key}
            </span>
            <span className="tabular-nums">{counts[s.key]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CandidateSummaryCard({ candidate }: { candidate: CandidateAiSummary }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{candidate.name}</span>
        <div className="flex items-center gap-2">
          <span
            className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium capitalize", RECOMMENDATION_STYLE[candidate.recommendation])}
          >
            {candidate.recommendation}
          </span>
          <span className="text-sm tabular-nums text-muted-foreground">AI {candidate.aiScore}/100</span>
        </div>
      </div>
      <p className="mt-2 text-sm text-pretty">{candidate.summary}</p>
      {(candidate.strengths.length > 0 || candidate.concerns.length > 0) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {candidate.strengths.length > 0 && (
            <div>
              <p className="text-xs font-semibold tracking-wide text-emerald-300 uppercase">Strengths</p>
              <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
                {candidate.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {candidate.concerns.length > 0 && (
            <div>
              <p className="text-xs font-semibold tracking-wide text-rose-300 uppercase">Concerns</p>
              <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
                {candidate.concerns.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AiReportPanel({ jobId }: { jobId: string }) {
  const [state, setState] = useState<State>({ status: "idle" });

  async function run() {
    setState({ status: "pending" });
    try {
      const res = await fetch("/api/reports/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const body = (await res.json().catch(() => ({}))) as JobAiSummary & { error?: string };
      if (!res.ok) {
        setState({ status: "error", message: body.error ?? "Could not generate the AI report." });
        return;
      }
      setState({ status: "done", data: body });
    } catch {
      setState({ status: "error", message: "Network error. Please try again." });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Button type="button" variant="outline" size="sm" onClick={run} disabled={state.status === "pending"} className="w-fit gap-2">
        {state.status === "pending" ? (
          <Loader2 aria-hidden className="size-4 motion-safe:animate-spin" />
        ) : (
          <Sparkles aria-hidden className="size-4" />
        )}
        {state.status === "pending" ? "Generating AI report..." : state.status === "done" ? "Regenerate AI report" : "AI Report"}
      </Button>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}

      {state.status === "done" && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <ScoreBar candidates={state.data.candidates} />
            <RecommendationDonut candidates={state.data.candidates} />
          </div>
          <div className="flex flex-col gap-3">
            {[...state.data.candidates]
              .sort((a, b) => b.aiScore - a.aiScore)
              .map((c) => (
                <CandidateSummaryCard key={c.candidateId} candidate={c} />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
