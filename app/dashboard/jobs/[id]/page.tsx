import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, CircleX } from "lucide-react";
import { getJobById } from "@/lib/jobs";
import { listCandidatesForJob } from "@/lib/candidates";
import { Badge } from "@/components/ui/badge";
import { ResumeUpload } from "@/components/jobs/resume-upload";
import { ExtractRequirementsButton } from "@/components/jobs/extract-requirements-button";
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

  const candidates = (await listCandidatesForJob(id)).sort(
    (a, b) => (b.score?.total ?? -1) - (a.score?.total ?? -1),
  );
  const mustHaves = job.requirements.filter((r) => r.mustHave).length;

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold text-balance">{job.title}</h1>
        <p className="text-sm text-muted-foreground">
          Posted {new Date(job.createdAt).toLocaleDateString()}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Requirements</CardTitle>
          <CardDescription>
            {job.requirements.length > 0
              ? `${job.requirements.length} requirements extracted from the job description, ${mustHaves} must-have. Weight is each requirement's share of the score.`
              : "Requirements haven't been extracted yet. The model call may have failed when the job was created."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {job.requirements.length > 0 ? (
            <ol className="divide-y">
              {job.requirements.map((r) => (
                <li key={r.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.skill}</span>
                    {r.mustHave && <Badge>Must-have</Badge>}
                    {r.level !== "any" && (
                      <Badge variant="outline" className="capitalize">
                        {r.level}
                      </Badge>
                    )}
                    <span className="ml-auto text-sm text-muted-foreground tabular-nums">
                      {Math.round(r.weight * 100)}%
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground text-pretty">{r.rawText}</p>
                </li>
              ))}
            </ol>
          ) : (
            <ExtractRequirementsButton jobId={job.id} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Candidates</CardTitle>
          <CardDescription>
            Each resume is read, its claims are grounded in the resume text, and it is scored against the requirements above.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <ResumeUpload jobId={job.id} disabled={job.requirements.length === 0} />

          {candidates.length > 0 && (
            <div className="overflow-x-auto">
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
                          href={`/dashboard/jobs/${job.id}/candidates/${c.id}`}
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
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <details>
            <summary className="cursor-pointer font-medium">Job description</summary>
            <pre className="mt-4 font-sans text-sm whitespace-pre-wrap">{job.jdText}</pre>
          </details>
        </CardContent>
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
