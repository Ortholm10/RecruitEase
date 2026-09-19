import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getJobById } from "@/lib/jobs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJobById(id);

  if (!job) notFound();

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold">{job.title}</h1>
        <p className="text-sm text-muted-foreground">
          Posted {new Date(job.createdAt).toLocaleDateString()}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Job description</CardTitle>
          <CardDescription>
            {job.requirements.length > 0
              ? `${job.requirements.length} requirements extracted`
              : "Requirements haven't been extracted yet."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="font-sans text-sm whitespace-pre-wrap">
            {job.jdText}
          </pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Candidates</CardTitle>
          <CardDescription>
            Bulk resume upload lands here in the next phase.
          </CardDescription>
        </CardHeader>
      </Card>
    </>
  );
}

export default function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading job...</p>
        }
      >
        <JobDetail params={params} />
      </Suspense>
    </div>
  );
}
