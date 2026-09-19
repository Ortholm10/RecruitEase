import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getJobById } from "@/lib/jobs";
import { getCandidateWithScore } from "@/lib/candidates";
import { EvidenceView } from "@/components/candidates/evidence-view";
import { StartInterviewButton } from "@/components/interview/start-interview-button";
import { InterviewPanel } from "@/components/interview/interview-panel";
import { findLatestInterviewForCandidate } from "@/lib/interview/queries";

type Params = Promise<{ id: string; candidateId: string }>;

async function CandidateEvidence({ params }: { params: Params }) {
  const { id, candidateId } = await params;
  const [job, found, interview] = await Promise.all([
    getJobById(id),
    getCandidateWithScore(id, candidateId),
    findLatestInterviewForCandidate(candidateId),
  ]);
  if (!job || !found) notFound();
  const { candidate, score } = found;

  return (
    <>
      <div className="flex flex-col gap-3">
        <Link
          href={`/dashboard/jobs/${job.id}`}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {job.title}
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-balance">{candidate.name}</h1>
          <p className="text-sm text-muted-foreground">
            {[
              candidate.email,
              score && `Scored ${new Date(score.createdAt).toLocaleDateString()} · rubric ${score.rubricVersion}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>

      {score ? (
        <>
          <section
            aria-labelledby="interview-heading"
            className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-5"
          >
            <div className="flex flex-col gap-1">
              <h2 id="interview-heading" className="font-semibold">
                Pre-interview
              </h2>
              <p className="text-sm text-muted-foreground text-pretty">
                {interview
                  ? "An interview already exists for this candidate — status, the share link and the results live below."
                  : "Generates an adaptive text interview from this score: 2 resume probes, 2 gap probes, 1 artifact question and 3 rapid-fire questions, with adaptive follow-ups capped at two per question."}
              </p>
            </div>
            {interview ? null : <StartInterviewButton candidateId={candidate.id} />}
          </section>
          <EvidenceView requirements={job.requirements} candidate={candidate} score={score} />
          <InterviewPanel candidateId={candidate.id} />
        </>
      ) : (
        <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          Scoring didn&apos;t finish for this candidate. Use the retry button in the upload list where the
          resume was uploaded.
        </div>
      )}
    </>
  );
}

export default function CandidateEvidencePage({ params }: { params: Params }) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading evidence...</p>}>
        <CandidateEvidence params={params} />
      </Suspense>
    </div>
  );
}
