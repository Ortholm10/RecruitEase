import { NextResponse } from "next/server";
import { ApiError, resolveInterviewAccess } from "@/lib/interview/access";
import { buildPlanned, firstServedQuestion, reconstructPosition } from "@/lib/interview/serve";
import type { InterviewStateResponse } from "@/types";

/**
 * GET /api/interviews/[id]/state?email=<candidate email>
 * Resume point for the room. Returns plan, progress and the currently served
 * question (or null when completed). A brand-new interview serves q1 via the
 * start endpoint; this endpoint reconstructs the exact mid-interview position
 * from turn rows — a served-but-unanswered follow-up is resumed verbatim from
 * its own row (prompt included), and an answered question advances to the next
 * planned one. No guessing, so a reload can never resurrect a stale question.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const email = url.searchParams.get("email")?.trim() || undefined;

    const { client, interview, candidate } = await resolveInterviewAccess(id, email);

    const { data: turns } = await client
      .from("turns")
      .select("question_id, follow_up_depth, asked_at, answered_at, evidence_linked_requirement")
      .eq("interview_id", interview.id)
      .order("asked_at", { ascending: true });
    const turnRows = (turns ?? []) as {
      question_id: string;
      follow_up_depth: number;
      asked_at: string;
      answered_at: string | null;
      evidence_linked_requirement: string | null;
    }[];
    const answeredTurns = turnRows.filter((t) => t.answered_at !== null);

    const now = new Date().toISOString();
    let servedQuestion: InterviewStateResponse["servedQuestion"] = null;
    if (interview.status === "in_progress") {
      const pos = reconstructPosition(
        interview.plan,
        turnRows.map((t) => ({
          questionId: t.question_id,
          followUpDepth: t.follow_up_depth,
          answered: t.answered_at !== null,
          prompt: t.answered_at === null ? (t.evidence_linked_requirement ?? null) : null,
          servedAt: t.answered_at === null ? t.asked_at : null,
        })),
      );
      if (pos) {
        const base = buildPlanned(interview.plan, pos.parentIndex, now);
        if (base) {
          servedQuestion =
            pos.prompt !== null
              ? {
                  ...base,
                  type: "follow_up",
                  followUpDepth: pos.depth,
                  prompt: pos.prompt,
                  servedAt: pos.servedAt ?? now,
                }
              : base;
        }
      }
    } else if (interview.status === "not_started") {
      servedQuestion = firstServedQuestion(interview.plan, now);
    }

    const body: InterviewStateResponse = {
      interviewId: interview.id,
      status: interview.status,
      candidateName: candidate.email.split("@")[0],
      plan: interview.plan,
      progress: { answered: answeredTurns.length, total: interview.plan.questions.length },
      servedQuestion,
    };
    return NextResponse.json(body);
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[interviews/state] failed:", err);
    return NextResponse.json({ error: "Could not load interview state." }, { status: 500 });
  }
}