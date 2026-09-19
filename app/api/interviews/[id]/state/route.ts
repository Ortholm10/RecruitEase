import { NextResponse } from "next/server";
import { ApiError, resolveInterviewAccess } from "@/lib/interview/access";
import { buildPlanned, firstServedQuestion, reconstructPosition } from "@/lib/interview/serve";
import type { InterviewStateResponse } from "@/types";

/**
 * GET /api/interviews/[id]/state?email=<candidate email>
 * Resume point for the room. Returns plan, progress and the currently served
 * question (or null when completed). A brand-new interview serves q1 via the
 * start endpoint; this endpoint reconstructs mid-interview position from the
 * answered turns. The pending follow-up prompt, when a follow-up is in flight,
 * is supplied by the room from localStorage — that prompt is what was actually
 * shown on screen.
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
      .select("question_id, follow_up_depth, answered_at")
      .eq("interview_id", interview.id);
    const answeredTurns =
      (turns ?? []).filter((t: { answered_at: string | null }) => t.answered_at !== null) as {
        question_id: string;
        follow_up_depth: number;
      }[];

    const now = new Date().toISOString();
    let servedQuestion: InterviewStateResponse["servedQuestion"] = null;
    if (interview.status === "in_progress") {
      const pos = reconstructPosition(
        interview.plan,
        answeredTurns.map((t) => ({ questionId: t.question_id, followUpDepth: t.follow_up_depth })),
      );
      servedQuestion = pos ? buildPlanned(interview.plan, pos.parentIndex, now) : null;
      if (pos && pos.depth > 0 && servedQuestion) {
        // A follow-up slot is open; the room restores the exact served prompt
        // from localStorage and patches it in. Serve the planned prompt as a
        // floor so there is always something coherent on screen.
        servedQuestion = {
          ...servedQuestion,
          type: "follow_up",
          followUpDepth: pos.depth,
        };
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