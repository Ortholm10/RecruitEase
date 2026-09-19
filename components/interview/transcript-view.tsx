import { cn } from "@/lib/utils";
import { listTurns } from "@/lib/interview/queries";
import type { InterviewPlan, Turn } from "@/types";

/**
 * Recruiter-facing transcript. Renders every planned question with its
 * answered turns (follow-ups indented beneath their parent). The follow-up
 * prompt itself lives in the child turn's evidenceLinkedRequirement field —
 * the only way we have to show "what exactly was asked" without schema
 * changes (see brief). A turn with no answeredAt is skipped (it was served
 * but abandoned).
 */
export async function TranscriptView({
  plan,
  interviewId,
}: {
  plan: InterviewPlan;
  interviewId: string;
}) {
  const turns = await listTurns(interviewId);
  const answered = turns.filter((t: Turn) => t.answeredAt !== null);

  return (
    <ol className="flex flex-col gap-6">
      {plan.questions.map((q) => {
        const chain = answered.filter((t: Turn) => t.questionId === q.id);
        if (chain.length === 0) {
          return (
            <li key={q.id} className="flex flex-col gap-1">
              <QuestionLine q={q} />
              <p className="text-sm text-muted-foreground italic">Not attempted.</p>
            </li>
          );
        }
        return (
          <li key={q.id} className="flex flex-col gap-3">
            <QuestionLine q={q} />
            {chain.map((t: Turn) => (
              <div
                key={t.id}
                className={cn(
                  "flex flex-col gap-1 border-l-2 pl-4",
                  t.followUpDepth > 0 && "ml-2",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {t.followUpDepth === 0
                      ? "Answer"
                      : `Follow-up ${t.followUpDepth}`}
                    {t.followUpDepth > 0 && t.evidenceLinkedRequirement ? (
                      <span className="ml-2 font-normal text-muted-foreground">
                        &quot;{t.evidenceLinkedRequirement}&quot;
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    answered {new Date(t.answeredAt!).toLocaleString()}
                  </p>
                </div>
                <p className="text-sm whitespace-pre-wrap text-pretty">{t.transcript || "(empty)"}</p>
                {t.verdict ? (
                  <p className="text-sm font-medium">
                    Verdict:{" "}
                    <span className="text-foreground capitalize">{t.verdict}</span>
                  </p>
                ) : null}
              </div>
            ))}
          </li>
        );
      })}
    </ol>
  );
}

function QuestionLine({ q }: { q: InterviewPlan["questions"][number] }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {q.type}
        {q.timeLimitSeconds != null ? ` · ${q.timeLimitSeconds}s` : ""}
        {q.requirementId ? ` · ${q.requirementId}` : ""}
      </p>
      <p className="text-sm font-medium whitespace-pre-wrap text-pretty">{q.prompt}</p>
      {q.artifactPayload ? (
        <pre className="mt-1 overflow-x-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">
          {q.artifactPayload}
        </pre>
      ) : null}
    </div>
  );
}