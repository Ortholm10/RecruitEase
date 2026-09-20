import Link from "next/link";
import { Suspense } from "react";
import { BarChart3, ChevronDown } from "lucide-react";
import { listCandidateAnalyses, groupCandidatesByJob } from "@/lib/candidates";
import { listLatestInterviewsForCandidates } from "@/lib/interview/queries";
import { EvidenceView } from "@/components/candidates/evidence-view";
import { EmptyState } from "@/components/dashboard/empty-state";
import { AiReportPanel } from "@/components/reports/ai-report-panel";
import { TranscriptView } from "@/components/interview/transcript-view";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

async function ReportsOverview() {
  const rows = await listCandidateAnalyses();
  const grouped = groupCandidatesByJob(rows);
  const interviewByCandidate = await listLatestInterviewsForCandidates(
    rows.map((r) => r.candidate.id),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">
          Resume analysis for every candidate, scored against their role&apos;s requirements.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No reports yet"
          description="Score a resume first — the per-requirement evidence and analysis will appear here."
          actionHref="/dashboard/jobs/new"
          actionLabel="Create a job"
        />
      ) : (
        grouped.map(({ job, candidates }) => (
          <Card key={job.id}>
            <CardHeader className="flex flex-col gap-3">
              <CardTitle className="flex items-center gap-3">
                <Link href={`/dashboard/jobs/${job.id}`} className="underline-offset-4 hover:underline">
                  {job.title}
                </Link>
                <Badge variant="outline">
                  {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
                </Badge>
              </CardTitle>
              <AiReportPanel jobId={job.id} />
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {candidates.map((analysis) => {
                const interview = interviewByCandidate.get(analysis.candidate.id) ?? null;
                const hasResults = interview && interview.status !== "not_started";
                return analysis.score ? (
                  <details key={analysis.candidate.id} className="group rounded-xl border bg-card">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <p className="font-medium">{analysis.candidate.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{analysis.candidate.email}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-4">
                        <span className="text-sm tabular-nums">
                          Score <span className="font-semibold">{analysis.score.total}/100</span>
                        </span>
                        {analysis.score.mustHaveGateFailed ? <Badge variant="outline">Gate failed</Badge> : null}
                        <ChevronDown
                          aria-hidden
                          className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
                        />
                      </div>
                    </summary>
                    <div className="flex flex-col gap-4 border-t p-4">
                      <EvidenceView
                        requirements={analysis.job.requirements}
                        candidate={analysis.candidate}
                        score={analysis.score}
                      />
                      {hasResults ? (
                        <details className="rounded-xl border bg-card/60">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-medium">
                            View interview results
                            <ChevronDown aria-hidden className="size-4 text-muted-foreground" />
                          </summary>
                          <div className="border-t p-4">
                            <TranscriptView plan={interview!.plan} interviewId={interview!.id} />
                          </div>
                        </details>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No interview taken yet — start one from the candidate&apos;s page to see results here.
                        </p>
                      )}
                    </div>
                  </details>
                ) : (
                  <div
                    key={analysis.candidate.id}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-3",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{analysis.candidate.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {analysis.candidate.email} · not scored yet
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">No analysis available</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading reports...</p>}>
      <ReportsOverview />
    </Suspense>
  );
}