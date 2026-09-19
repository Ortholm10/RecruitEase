import type { Interview } from "@/types";
import { findLatestInterviewForCandidate } from "@/lib/interview/queries";
import { TranscriptView } from "@/components/interview/transcript-view";
import { CopyInterviewLinkButton } from "@/components/interview/copy-interview-link-button";

type InterviewRow = Interview;

export async function InterviewPanel({ candidateId }: { candidateId: string }) {
  const interview: InterviewRow | null = await findLatestInterviewForCandidate(candidateId);
  if (!interview) return null;

  return (
    <section
      aria-labelledby="transcript-heading"
      className="flex flex-col gap-4 rounded-xl border bg-card p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="transcript-heading" className="font-semibold">
            Interview transcript
          </h2>
          <p className="text-sm text-muted-foreground">
            Status: {interview.status}
            {interview.completedAt
              ? ` · finished ${new Date(interview.completedAt).toLocaleString()}`
              : ""}
          </p>
        </div>
        <CopyInterviewLinkButton interviewId={interview.id} />
      </div>
      {interview.status === "not_started" || interview.status === "in_progress" ? (
        <p className="text-sm text-muted-foreground">
          The transcript fills in as turns are answered.
        </p>
      ) : (
        <TranscriptView plan={interview.plan} interviewId={interview.id} />
      )}
    </section>
  );
}