import { cn } from "@/lib/utils";
import { listIntegrityEvents } from "@/lib/interview/queries";
import {
  buildIntegrityReport,
  describeEvent,
  latencyStats,
  questionLabel,
} from "@/lib/integrity";
import type { IntegrityRiskLevel, InterviewPlan, Turn } from "@/types";

/**
 * Recruiter-facing integrity assessment for a completed interview (Phase 4).
 * Collapsed by default; opens to show an objective risk badge, a per-question
 * time-to-first-word latency chart, and a chronological timeline of captured
 * browser signals + answered turns. Displays weighted evidence ONLY — never a
 * binary cheater / not-cheater verdict.
 */
export async function IntegrityPanel({
  interviewId,
  turns,
  plan,
}: {
  interviewId: string;
  turns: Turn[];
  plan: InterviewPlan;
}) {
  const [events] = await Promise.all([
    listIntegrityEvents(interviewId).catch(() => []),
  ]);
  const report = buildIntegrityReport(interviewId, turns, events);
  const { timings } = latencyStats(turns, plan);
  const maxSeconds = Math.max(2, ...timings.map((t) => t.seconds));

  return (
    <section
      aria-labelledby="integrity-heading"
      className="rounded-xl border bg-card p-5"
    >
      <details className="group" open={false}>
        <summary
          id="integrity-heading"
          className="flex cursor-pointer select-none items-center justify-between gap-3"
        >
          <span className="flex items-center gap-3">
            <span className="font-semibold">Integrity Assessment</span>
            <RiskBadge risk={report.riskLevel} />
            {report.totalSignals > 0 ? (
              <span className="text-xs text-muted-foreground">
                {report.totalSignals} signal{report.totalSignals === 1 ? "" : "s"}
              </span>
            ) : null}
          </span>
          <span className="text-xs text-muted-foreground group-open:hidden">Expand</span>
          <span className="text-xs text-muted-foreground hidden group-open:inline">Collapse</span>
        </summary>

        <div className="mt-4 flex flex-col gap-5">
          <p className="text-sm text-pretty text-muted-foreground">
            Objective readings only — this is evidence to weigh alongside the transcript, never a
            verdict. Hidden verification markers ({report.latency.samples} timed answers) are
            rendered invisibly on screen during the interview and stripped from stored answers.
          </p>

          {report.latency.samples > 0 ? (
            <LatencyChart timings={timings} maxSeconds={maxSeconds} uniform={report.latency.uniformPattern} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No timing readings available for this interview.
            </p>
          )}

          <Timeline
            events={events}
            turns={turns}
            plan={plan}
            uniformLatency={report.latency.uniformPattern}
          />

          {report.signals.length === 0 && events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No integrity signals were captured during this interview.
            </p>
          ) : null}
        </div>
      </details>
    </section>
  );
}

const BADGE: Record<IntegrityRiskLevel, { label: string; cls: string }> = {
  low: { label: "Low Risk", cls: "border-emerald-600/30 bg-emerald-50 text-emerald-700" },
  medium: { label: "Review Suggested", cls: "border-amber-600/30 bg-amber-50 text-amber-700" },
  high: { label: "Elevated Patterns", cls: "border-rose-600/30 bg-rose-50 text-rose-700" },
};

function RiskBadge({ risk }: { risk: IntegrityRiskLevel }) {
  const { label, cls } = BADGE[risk];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        cls,
      )}
    >
      {label}
    </span>
  );
}

/** Vertical bars of time-to-first-word per answered turn. */
function LatencyChart({
  timings,
  maxSeconds,
  uniform,
}: {
  timings: { questionLabel: string; seconds: number; followUpDepth: number }[];
  maxSeconds: number;
  uniform: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Time to first word</p>
        {uniform ? (
          <p className="text-xs text-amber-600">
            Near-constant delay across questions
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Varies with question</p>
        )}
      </div>
      <div className="flex h-28 items-end gap-2" aria-hidden="true">
        {timings.map((t) => {
          const h = Math.max(3, Math.round((t.seconds / maxSeconds) * 96));
          return (
            <div key={`${t.questionLabel}-${t.followUpDepth}`} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] text-muted-foreground tabular-nums">{t.seconds.toFixed(1)}s</span>
              <div
                className={cn(
                  "w-full max-w-8 rounded-t",
                  uniform ? "bg-amber-400/80" : "bg-primary/70",
                )}
                style={{ height: `${h}px` }}
              />
              <span className="text-[10px] text-muted-foreground">
                {t.questionLabel}
                {t.followUpDepth > 0 ? `·${t.followUpDepth}` : ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Chronological timeline merging answered turns and captured events. */
function Timeline({
  events,
  turns,
  plan,
  uniformLatency,
}: {
  events: Parameters<typeof describeEvent>[0][];
  turns: Turn[];
  plan: InterviewPlan;
  uniformLatency: boolean;
}) {
  type Row = {
    at: string;
    kind: "turn" | "event";
    label: string;
    detail: string;
  };
  const rows: Row[] = [];

  for (const t of turns) {
    if (t.answeredAt === null) continue;
    const lat = t.firstWordAt
      ? ` · first word ${((new Date(t.firstWordAt).getTime() - new Date(t.askedAt).getTime()) / 1000).toFixed(1)}s after served`
      : "";
    rows.push({
      at: t.answeredAt,
      kind: "turn",
      label: `${questionLabel(t.questionId, plan)}${t.followUpDepth > 0 ? ` · follow-up ${t.followUpDepth}` : ""} answered`,
      detail: `Answer recorded${lat}.`,
    });
  }
  for (const e of events) {
    rows.push({
      at: e.ts,
      kind: "event",
      label: e.type,
      detail: describeEvent(e),
    });
  }
  if (uniformLatency) {
    const at = rows[0]?.at ?? new Date().toISOString();
    rows.push({
      at,
      kind: "event",
      label: "latency_variance",
      detail: "Consistent response delay measured across questions.",
    });
  }
  rows.sort((a, b) => a.at.localeCompare(b.at));

  if (rows.length === 0) return null;
  return (
    <ol className="flex flex-col gap-3 border-l-2 border-muted pl-4">
      {rows.map((r, i) => (
        <li key={i} className="flex flex-col gap-0.5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className={cn(
              "font-mono text-xs font-semibold",
              r.kind === "event" && "text-primary",
            )}>
              {r.label}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {new Date(r.at).toLocaleString()}
            </p>
          </div>
          <p className="text-sm text-pretty text-muted-foreground">{r.detail}</p>
        </li>
      ))}
    </ol>
  );
}