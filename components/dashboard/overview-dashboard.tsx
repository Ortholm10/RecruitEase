"use client";

import { useState } from "react";
import { ChevronDown, Download, Gauge, ShieldCheck, Target, Users, type LucideIcon } from "lucide-react";
import { EvidenceView } from "@/components/candidates/evidence-view";
import { EmptyState } from "@/components/dashboard/empty-state";
import type { CandidateAnalysis, JobSummary } from "@/lib/candidates";
import type { Candidate, Score } from "@/types";
import { cn } from "@/lib/utils";

type Group = { job: JobSummary; candidates: CandidateAnalysis[] };

function scoreTier(score: Score | null) {
  if (!score) return { label: "Not scored", className: "bg-white/10 text-white/60" };
  if (score.mustHaveGateFailed) return { label: "Gate Disqualified", className: "bg-rose-500/15 text-rose-300" };
  if (score.total >= 80) return { label: "Strong Match", className: "bg-cyan-500/15 text-cyan-300" };
  if (score.total >= 60) return { label: "Qualified", className: "bg-emerald-500/15 text-emerald-300" };
  if (score.total >= 45) return { label: "Borderline", className: "bg-amber-500/15 text-amber-300" };
  return { label: "Low Match", className: "bg-white/10 text-white/60" };
}

function probingFocus(score: Score, requirements: JobSummary["requirements"]) {
  const skills = score.unproven
    .map((id) => requirements.find((r) => r.id === id)?.skill)
    .filter((s): s is string => Boolean(s));
  return skills.slice(0, 3).join(", ");
}

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function exportCsv(grouped: Group[]) {
  const header = ["Job", "Candidate", "Email", "Score", "Gate", "To probe"];
  const rows = grouped.flatMap(({ job, candidates }) =>
    candidates.map(({ candidate, score }) => [
      job.title,
      candidate.name,
      candidate.email,
      score?.total ?? "",
      score ? (score.mustHaveGateFailed ? "Failed" : "Passed") : "",
      score?.unproven.length ?? "",
    ]),
  );
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "candidates.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-card/60 p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
        <Icon className="size-4 text-muted-foreground" aria-hidden />
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function ScoreSpectrum({ group }: { group: Group }) {
  const threshold = 60;
  const bars = [...group.candidates]
    .sort((a, b) => (b.score?.total ?? -1) - (a.score?.total ?? -1))
    .slice(0, 8);

  return (
    <div className="rounded-xl border border-white/10 bg-card/60 p-5">
      <h2 className="font-semibold">Score spectrum</h2>
      <p className="text-xs text-muted-foreground">
        {group.job.title} · pass threshold {threshold}
      </p>
      {bars.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No candidates for this job yet.</p>
      ) : (
        <div className="relative mt-8 flex h-48 items-end gap-3">
          <div
            aria-hidden
            className="absolute right-0 left-0 border-t border-dashed border-white/20"
            style={{ bottom: `${threshold}%` }}
          />
          {bars.map(({ candidate, score }) => (
            <div key={candidate.id} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="text-xs font-medium tabular-nums">{score ? score.total.toFixed(1) : "–"}</span>
              <div className="flex h-full w-full items-end">
                <div
                  className={cn(
                    "w-full rounded-t-md bg-gradient-to-t",
                    !score
                      ? "bg-white/10"
                      : score.mustHaveGateFailed
                        ? "from-rose-600 to-rose-400"
                        : "from-indigo-500 via-sky-400 to-cyan-300",
                  )}
                  style={{ height: score ? `${Math.max(score.total, 2)}%` : "2%" }}
                />
              </div>
              <span className="w-full truncate text-center text-[11px] text-muted-foreground">
                {candidate.name.split(" ")[0]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GateDonut({
  strong,
  probing,
  failed,
  total,
}: {
  strong: number;
  probing: number;
  failed: number;
  total: number;
}) {
  const r = 60;
  const c = 2 * Math.PI * r;
  const segments = [
    { key: "strong", value: strong, className: "stroke-cyan-400" },
    { key: "probing", value: probing, className: "stroke-indigo-400" },
    { key: "failed", value: failed, className: "stroke-rose-400" },
  ];
  let offset = 0;
  const pct = total ? Math.round((strong / total) * 100) : 0;

  return (
    <div className="rounded-xl border border-white/10 bg-card/60 p-5">
      <h2 className="font-semibold">Gate qualification</h2>
      <p className="text-xs text-muted-foreground">Hard-requirement checks, all jobs</p>
      <div className="relative mt-4 flex items-center justify-center">
        <svg viewBox="0 0 140 140" className="size-40 -rotate-90">
          <circle cx="70" cy="70" r={r} fill="none" stroke="currentColor" strokeWidth="14" className="text-white/10" />
          {total > 0 &&
            segments.map((s) => {
              if (s.value === 0) return null;
              const len = (s.value / total) * c;
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
          <span className="text-2xl font-semibold">{pct}%</span>
          <span className="text-[11px] text-muted-foreground">Strong match</span>
        </div>
      </div>
      <ul className="mt-4 flex flex-col gap-1.5 text-xs">
        <li className="flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-cyan-400" />
            Strong match
          </span>
          <span className="tabular-nums">{strong}</span>
        </li>
        <li className="flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-indigo-400" />
            Needs probing
          </span>
          <span className="tabular-nums">{probing}</span>
        </li>
        <li className="flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-rose-400" />
            Gate failed
          </span>
          <span className="tabular-nums">{failed}</span>
        </li>
      </ul>
    </div>
  );
}

function CandidateRow({
  analysis,
  requirements,
}: {
  analysis: CandidateAnalysis;
  requirements: JobSummary["requirements"];
}) {
  const { candidate, score }: { candidate: Candidate; score: Score | null } = analysis;
  const tier = scoreTier(score);

  return (
    <details className="group/row rounded-lg border border-white/10 bg-white/[0.02]">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{candidate.name}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", tier.className)}>
              {tier.label}
            </span>
          </div>
          <p className="truncate text-xs text-muted-foreground">{candidate.email || "No email found"}</p>
          {score && score.unproven.length > 0 && (
            <p className="mt-1 text-xs text-indigo-300">Probing focus: {probingFocus(score, requirements)}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-4 text-sm">
          <span className="tabular-nums">{score ? `${score.total.toFixed(1)} / 100` : "Not scored"}</span>
          {score && (
            <span className="tabular-nums text-muted-foreground">{score.unproven.length} to probe</span>
          )}
          <ChevronDown
            aria-hidden
            className="size-4 text-muted-foreground transition-transform group-open/row:rotate-180"
          />
        </div>
      </summary>
      {score && (
        <div className="border-t border-white/10 p-4">
          <EvidenceView requirements={requirements} candidate={candidate} score={score} />
        </div>
      )}
    </details>
  );
}

function JobGroupCard({ group }: { group: Group }) {
  const sorted = [...group.candidates].sort((a, b) => (b.score?.total ?? -1) - (a.score?.total ?? -1));

  return (
    <details className="group rounded-xl border border-white/10 bg-card/60" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="font-semibold">{group.job.title}</h2>
          <p className="text-xs text-muted-foreground">
            {group.candidates.length} candidate{group.candidates.length === 1 ? "" : "s"}
          </p>
        </div>
        <ChevronDown aria-hidden className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-3 border-t border-white/10 px-5 py-4">
        {sorted.map((c) => (
          <CandidateRow key={c.candidate.id} analysis={c} requirements={group.job.requirements} />
        ))}
      </div>
    </details>
  );
}

export function OverviewDashboard({ grouped }: { grouped: Group[] }) {
  const jobsWithCandidates = grouped.filter((g) => g.candidates.length > 0);
  const [selectedJobId, setSelectedJobId] = useState(jobsWithCandidates[0]?.job.id ?? "");
  const selected = jobsWithCandidates.find((g) => g.job.id === selectedJobId) ?? jobsWithCandidates[0];

  const all = grouped.flatMap((g) => g.candidates);
  const scored = all.filter((c) => c.score);
  const totalScreened = all.length;
  const averageScore = scored.length
    ? scored.reduce((s, c) => s + (c.score?.total ?? 0), 0) / scored.length
    : 0;
  const qualified = scored.filter((c) => !c.score?.mustHaveGateFailed).length;
  const gatePassRate = scored.length ? (qualified / scored.length) * 100 : 0;
  const avgProbes = scored.length
    ? scored.reduce((s, c) => s + (c.score?.unproven.length ?? 0), 0) / scored.length
    : 0;

  const gateFailedCount = scored.filter((c) => c.score?.mustHaveGateFailed).length;
  const strongCount = scored.filter((c) => !c.score?.mustHaveGateFailed && (c.score?.total ?? 0) >= 80).length;
  const probingCount = scored.length - gateFailedCount - strongCount;

  if (totalScreened === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No candidates yet"
        description="Create a job and upload resumes to see screening analytics here."
        actionHref="/dashboard/jobs/new"
        actionLabel="Create a job"
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Candidates & Intelligence Overview</h1>
          <p className="text-sm text-muted-foreground">
            Screening, gate scoring, and resume analysis across your job postings.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {jobsWithCandidates.length > 0 && selected && (
            <select
              value={selected.job.id}
              onChange={(e) => setSelectedJobId(e.target.value)}
              className="h-9 rounded-md border border-white/10 bg-white/5 px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {jobsWithCandidates.map((g) => (
                <option key={g.job.id} value={g.job.id} className="bg-background text-foreground">
                  {g.job.title}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => exportCsv(grouped)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 text-sm font-medium transition-colors hover:bg-white/10"
          >
            <Download className="size-4" aria-hidden />
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Users} label="Total screened" value={totalScreened} sub={`${scored.length} scored`} />
        <StatCard icon={Gauge} label="Average score" value={averageScore.toFixed(1)} sub="/ 100 max" />
        <StatCard
          icon={ShieldCheck}
          label="Gate pass rate"
          value={`${gatePassRate.toFixed(1)}%`}
          sub={`${qualified} / ${scored.length} qualified`}
        />
        <StatCard
          icon={Target}
          label="Avg probes / candidate"
          value={avgProbes.toFixed(1)}
          sub="requirements to verify"
        />
      </div>

      {selected && (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <ScoreSpectrum group={selected} />
          <GateDonut strong={strongCount} probing={probingCount} failed={gateFailedCount} total={scored.length} />
        </div>
      )}

      <div className="flex flex-col gap-4">
        {jobsWithCandidates.map((group) => (
          <JobGroupCard key={group.job.id} group={group} />
        ))}
      </div>
    </div>
  );
}
