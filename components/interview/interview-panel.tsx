import type { Interview, Turn } from "@/types";
import { findLatestInterviewForCandidate, listTurns } from "@/lib/interview/queries";
import { TranscriptView } from "@/components/interview/transcript-view";
import { CopyInterviewLinkButton } from "@/components/interview/copy-interview-link-button";

type InterviewRow = Interview;

/**
 * Recruiter-facing panel on the candidate detail page. Drives the whole
 * workflow: after Start Interview creates the plan, this panel hands the
 * recruiter the shareable link, tracks status as the candidate answers, and
 * renders the full answer transcript once the candidate finishes.
 */
export async function InterviewPanel({ candidateId }: { candidateId: string }) {
  const interview: InterviewRow | null = await findLatestInterviewForCandidate(candidateId);
  if (!interview) return null;

  const turns = await listTurns(interview.id);
  const answered = turns.filter((t: Turn) => t.answeredAt !== null);

  const statusLine =
    interview.status === "not_started"
      ? "Not started — send the share link so the candidate can take the test."
      : interview.status === "in_progress"
        ? `In progress — ${answered.length} answer${answered.length === 1 ? "" : "s"} recorded so far.`
        : interview.status === "completed"
          ? `Complete · ${answered.length} answer${answered.length === 1 ? "" : "s"} recorded · finished ${new Date(interview.completedAt!).toLocaleString()}`
          : "Abandoned.";

  return (
    <section
      aria-labelledby="transcript-heading"
      className="flex flex-col gap-4 rounded-xl border bg-card p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="transcript-heading" className="font-semibold">
            Interview
          </h2>
          <p className="text-sm text-muted-foreground">{statusLine}</p>
        </div>
        <CopyInterviewLinkButton interviewId={interview.id} />
      </div>
      {interview.status === "not_started" || interview.status === "in_progress" ? (
        <p className="text-sm text-muted-foreground">
          Results and the full answer-by-answer analysis appear here once the candidate
          finishes the interview.
        </p>
      ) : (
        <TranscriptView plan={interview.plan} interviewId={interview.id} />
      )}
    </section>
  );
}