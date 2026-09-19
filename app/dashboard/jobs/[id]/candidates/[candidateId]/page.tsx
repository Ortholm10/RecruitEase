import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getJobById } from "@/lib/jobs";
import { getCandidateWithScore } from "@/lib/candidates";
import { EvidenceView } from "@/components/candidates/evidence-view";

type Params = Promise<{ id: string; candidateId: string }>;

async function CandidateEvidence({ params }: { params: Params }) {
  const { id, candidateId } = await params;
  const [job, found] = await Promise.all([getJobById(id), getCandidateWithScore(id, candidateId)]);
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
        <EvidenceView requirements={job.requirements} candidate={candidate} score={score} />
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
