import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError, resolveInterviewAccess } from "@/lib/interview/access";
import type { InterviewStateResponse } from "@/types";

/**
 * POST /api/interviews/[id]/start   body: { email }
 * The interview flips to in_progress with started_at set ONLY here — the
 * consent-screen "Start" click. Never before. Returns the first question to
 * serve (with a server-issued servedAt).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const reqBody = (await req.json().catch(() => ({}))) as { email?: string };
    const email = reqBody.email?.trim() || undefined;

    const { interview } = await resolveInterviewAccess(id, email);

    if (interview.status !== "not_started") {
      return NextResponse.json(
        {
          error:
            interview.status === "completed"
              ? "This interview has already been completed."
              : `Interview already started (${interview.status}).`,
        },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const updated = await createAdminClient()
      .from("interviews")
      .update({ status: "in_progress", started_at: now })
      .eq("id", interview.id)
      .select("status, started_at")
      .single();
    if (updated.error || !updated.data) {
      if (updated.error) console.error("[interviews/start] update failed:", updated.error.message);
      return NextResponse.json(
        { error: "Could not start the interview. Please retry." },
        { status: 500 },
      );
    }

    const served = interview.plan.questions[0];
    if (!served) {
      return NextResponse.json({ error: "This interview plan has no questions." }, { status: 500 });
    }

    const state: Pick<InterviewStateResponse, "interviewId" | "status" | "progress" | "servedQuestion"> = {
      interviewId: interview.id,
      status: "in_progress",
      progress: { answered: 0, total: interview.plan.questions.length },
      servedQuestion: { ...served, followUpDepth: 0, servedAt: now },
    };
    return NextResponse.json(state);
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[interviews/start] failed:", err);
    return NextResponse.json({ error: "Could not start the interview." }, { status: 500 });
  }
}