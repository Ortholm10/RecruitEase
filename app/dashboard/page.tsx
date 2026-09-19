import Link from "next/link";
import { Suspense } from "react";
import { Briefcase } from "lucide-react";
import { listJobsForCurrentRecruiter } from "@/lib/jobs";
import { StatsRow } from "@/components/dashboard/stats-row";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

async function JobsOverview() {
  const jobs = await listJobsForCurrentRecruiter();

  return (
    <>
      <StatsRow jobCount={jobs.length} />

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Jobs</h1>
        <Button asChild size="sm">
          <Link href="/dashboard/jobs/new">New job</Link>
        </Button>
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No jobs yet"
          description="Create your first job to start screening candidates."
          actionHref="/dashboard/jobs/new"
          actionLabel="Create a job"
        />
      ) : (
        <div className="grid gap-3">
          {jobs.map((job) => (
            <Link key={job.id} href={`/dashboard/jobs/${job.id}`}>
              <Card className="transition-colors hover:bg-accent/50">
                <CardHeader>
                  <CardTitle>{job.title}</CardTitle>
                  <CardDescription>
                    Posted {new Date(job.createdAt).toLocaleDateString()} ·{" "}
                    {job.requirements.length} requirement
                    {job.requirements.length === 1 ? "" : "s"} extracted
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading jobs...</p>
        }
      >
        <JobsOverview />
      </Suspense>
    </div>
  );
}
