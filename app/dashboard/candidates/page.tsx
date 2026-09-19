import Link from "next/link";
import { Suspense } from "react";
import { Users } from "lucide-react";
import { listCandidatesForRecruiter, groupCandidatesByJob } from "@/lib/candidates";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Badge } from "@/components/ui/badge";
import { CircleCheck, CircleX } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

async function CandidatesOverview() {
  const rows = await listCandidatesForRecruiter();
  const grouped = groupCandidatesByJob(rows);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Candidates</h1>
        <p className="text-sm text-muted-foreground">
          Every candidate across all the jobs you&apos;ve posted.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No candidates yet"
          description="Upload resumes on a job page to start screening."
          actionHref="/dashboard"
          actionLabel="Go to jobs"
        />
      ) : (
        grouped.map(({ job, candidates }) => (
          <Card key={job.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <Link href={`/dashboard/jobs/${job.id}`} className="underline-offset-4 hover:underline">
                  {job.title}
                </Link>
                <Badge variant="outline">
                  {candidates.length} candidate{candidates.length === 1 ? "" : "s"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th scope="col" className="pb-2 font-medium">Candidate</th>
                    <th scope="col" className="pb-2 text-right font-medium">Score</th>
                    <th scope="col" className="pb-2 pl-6 font-medium">Must-haves</th>
                    <th scope="col" className="pb-2 text-right font-medium">To probe</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="py-3 pr-4">
                        <Link
                          href={`/dashboard/jobs/${c.job.id}/candidates/${c.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {c.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">{c.email || "No email found"}</div>
                      </td>
                      <td className="py-3 text-right font-semibold tabular-nums">
                        {c.score ? c.score.total : "–"}
                      </td>
                      <td className="py-3 pl-6">
                        {!c.score ? (
                          <span className="text-muted-foreground">Not scored</span>
                        ) : c.score.mustHaveGateFailed ? (
                          <span className="inline-flex items-center gap-1.5 font-medium">
                            <CircleX aria-hidden className="size-4 text-verdict-absent" />
                            Gate failed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <CircleCheck aria-hidden className="size-4 text-verdict-strong" />
                            Passed
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-right tabular-nums">
                        {c.score ? c.score.unproven.length : "–"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

export default function CandidatesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading candidates...</p>}>
      <CandidatesOverview />
    </Suspense>
  );
}