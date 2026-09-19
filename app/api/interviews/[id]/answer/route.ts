import { NextResponse } from "next/server";
import { ApiError } from "@/lib/interview/access";
import { answerTurn } from "@/lib/interview/answerTurn";
import type { AnswerTurnRequest } from "@/types";

/**
 * POST /api/interviews/[id]/answer   body: AnswerTurnRequest
 * Submit one answered turn. The classification may rate-limit; when it does,
 * the request returns 503 with NO database write, so the room can retry the
 * exact same body safely.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as AnswerTurnRequest & { email?: string };
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body." }, { status: 400 });
    }
    const email = body.email?.trim() || undefined;
    const result = await answerTurn({ interviewId: id, email, req: body });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[interviews/answer] failed:", err);
    return NextResponse.json(
      { error: "Could not process the answer. Please try again." },
      { status: 503 },
    );
  }
}