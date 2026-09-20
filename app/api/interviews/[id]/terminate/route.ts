import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError, resolveInterviewAccess } from "@/lib/interview/access";

/** Why the room pulled the plug. Anything else is recorded as focus_loss. */
const REASONS = new Set(["focus_loss", "tab_hidden", "fullscreen_exit"]);

/**
 * POST /api/interviews/[id]/terminate   body: { email?, reason?, strikes? }
 *
 * Ends an in-progress interview for leaving the interview window, after the
 * room has already issued its one warning. Two writes, evidence first:
 *
 *   1. an integrity_event carrying payload.terminated — the evidence survives
 *      even if the status update loses a race,
 *   2. interviews.status -> 'abandoned', guarded on the row still being
 *      in_progress so a double-fire cannot re-terminate or clobber a finish.
 *
 * The event reuses the existing fullscreen_exit / window_focus_loss types
 * (integrity_events.type is a fixed CHECK constraint) and marks itself with
 * payload.terminated, so no migration is required.
 *
 * Answers already recorded are kept; answerTurn refuses further writes once the
 * status is no longer in_progress, and /access refuses re-entry to an abandoned
 * interview, so termination is final without any extra locking.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      email?: string;
      reason?: string;
      strikes?: number;
      questionId?: string;
    };
    const email = body.email?.trim() || undefined;
    const { interview } = await resolveInterviewAccess(id, email);

    // Idempotent: a retry (or a second listener firing) is a no-op, not a 409.
    if (interview.status === "abandoned") {
      return NextResponse.json({ ok: true, alreadyTerminated: true });
    }
    if (interview.status !== "in_progress") {
      return NextResponse.json(
        { error: `Interview is not in progress (${interview.status}).` },
        { status: 409 },
      );
    }

    const reason = REASONS.has(body.reason ?? "") ? body.reason! : "focus_loss";
    const now = new Date().toISOString();
    const admin = createAdminClient();

    const evented = await admin.from("integrity_events").insert({
      interview_id: interview.id,
      type: reason === "fullscreen_exit" ? "fullscreen_exit" : "window_focus_loss",
      ts: now,
      payload: {
        receivedAt: now,
        terminated: true,
        reason,
        strikes: Number.isFinite(body.strikes) ? Math.min(Number(body.strikes), 99) : 2,
        ...(body.questionId ? { questionId: body.questionId } : {}),
      },
    });
    if (evented.error) {
      console.error("[interviews/terminate] event insert failed:", evented.error.message);
    }

    const updated = await admin
      .from("interviews")
      .update({ status: "abandoned", completed_at: now })
      .eq("id", interview.id)
      .eq("status", "in_progress")
      .select("status");
    if (updated.error) {
      console.error("[interviews/terminate] status update failed:", updated.error.message);
      return NextResponse.json({ error: "Could not terminate the interview." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, terminatedAt: now, reason });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[interviews/terminate] failed:", err);
    return NextResponse.json({ error: "Could not terminate the interview." }, { status: 500 });
  }
}
