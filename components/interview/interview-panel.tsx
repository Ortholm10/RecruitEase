import type { Interview, Turn } from "@/types";
import {
  findLatestInterviewForCandidate,
  listIntegrityEvents,
  listTurns,
} from "@/lib/interview/queries";
import { isTerminationEvent } from "@/lib/integrity";
import { TranscriptView } from "@/components/interview/transcript-view";
import { IntegrityPanel } from "@/components/integrity/integrity-panel";
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

  // Recruiter-only surface, so this never crosses into the candidate feedback
  // report. A second read of the same table IntegrityPanel loads, kept separate
  // rather than threading a prop through purely for this banner.
  const termination =
    interview.status === "abandoned"
      ? (await listIntegrityEvents(interview.id).catch(() => [])).find(isTerminationEvent)
      : undefined;

  const statusLine =
    interview.status === "not_started"
      ? "Not started — send the share link so the candidate can take the test."
      : interview.status === "in_progress"
        ? `In progress — ${answered.length} answer${answered.length === 1 ? "" : "s"} recorded so far.`
        : interview.status === "completed"
          ? `Complete · ${answered.length} answer${answered.length === 1 ? "" : "s"} recorded · finished ${new Date(interview.completedAt!).toLocaleString()}`
          : termination
            ? `Terminated automatically ${new Date(termination.ts).toLocaleString()} · ${answered.length} answer${answered.length === 1 ? "" : "s"} recorded before it ended`
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
      {termination ? <TerminationBanner at={termination.ts} /> : null}
      {interview.status === "not_started" || interview.status === "in_progress" ? (
        <p className="text-sm text-muted-foreground">
          Results and the full answer-by-answer analysis appear here once the candidate
          finishes the interview.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <TranscriptView plan={interview.plan} interviewId={interview.id} />
          <IntegrityPanel
            interviewId={interview.id}
            turns={turns}
            plan={interview.plan}
          />
        </div>
      )}
    </section>
  );
}

/**
 * Unmissable banner for an interview the lockdown ended.
 *
 * NOTE: the wording here is an explicit verdict, which is a deliberate,
 * product-owner-approved exception to the "never a binary verdict" rule that
 * governs the rest of lib/integrity. It is the ONLY such string in the app, it
 * is recruiter-only, and it never reaches CandidateFeedbackReport. Soften it
 * here and nowhere else if that call is ever revisited.
 */
function TerminationBanner({ at }: { at: string }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-1 rounded-lg border border-destructive/40 bg-destructive/10 p-4"
    >
      <p className="font-semibold text-destructive">
        ⛔ Candidate cheated — interview terminated
      </p>
      <p className="text-sm text-pretty">
        This interview was ended automatically because the candidate left the interview window a
        second time, after being shown a full-screen warning that doing so would end it. It
        happened at {new Date(at).toLocaleString()}.
      </p>
      <p className="text-xs text-muted-foreground text-pretty">
        Answers recorded before that point are kept below. Note that a browser cannot distinguish
        a deliberate tab switch from a notification, assistive software, or a device interruption
        stealing focus — review the timeline before acting on this.
      </p>
    </div>
  );
}
