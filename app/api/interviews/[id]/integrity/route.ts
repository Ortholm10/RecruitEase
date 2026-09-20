import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError, resolveInterviewAccess } from "@/lib/interview/access";
import { buildIntegrityReport, describeEvent } from "@/lib/integrity";
import type { IntegrityEventType } from "@/types";

export const runtime = "nodejs";

/** Browser-behavior sensors the candidate's browser can report live. All are
 *  Tier 1 integrity event types — the engine consumes them, never the
 *  candidate-facing report. Paste/tab/focus rows carry a risk weight the
 *  engine aggregates into the interview's integrity risk score. */
const LIVE_SENSOR_TYPES: IntegrityEventType[] = [
  "tab_blur",
  "paste_event",
  "window_focus_loss",
  "fullscreen_exit",
];

function isLiveSensorType(value: unknown): value is IntegrityEventType {
  return typeof value === "string" && (LIVE_SENSOR_TYPES as string[]).includes(value);
}

/**
 * POST /api/interviews/[id]/integrity  body: { type, payload?, email? }
 *
 * The candidate's browser posts each sensor firing (tab blur, paste, focus
 * loss, fullscreen exit) the instant it happens during the interview. Each row
 * lands in integrity_events — the same table answerTurn writes canary rows
 * into — so the aggregation engine consumes them into a real risk score. The
 * integrity report never reaches the candidate at all.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let interviewId: string;
  try {
    ({ id: interviewId } = await params);
  } catch {
    return NextResponse.json({ error: "invalid interview id" }, { status: 400 });
  }

  let body: { type?: unknown; payload?: unknown; email?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  if (!isLiveSensorType(body?.type)) {
    return NextResponse.json({ error: "unknown event type" }, { status: 400 });
  }
  const type = body.type;
  const payload =
    body.payload && typeof body.payload === "object"
      ? (body.payload as Record<string, unknown>)
      : {};
  const email = typeof body.email === "string" ? body.email : undefined;

  try {
    const { interview } = await resolveInterviewAccess(interviewId, email);
    const admin = createAdminClient();
    const { error } = await admin
      .from("integrity_events")
      .insert({
        interview_id: interview.id,
        turn_id: null,
        type,
        payload,
        ts: new Date().toISOString(),
      });
    if (error) {
      console.error("[integrity] live write:", error.message);
      return NextResponse.json({ error: "could not record" }, { status: 500 });
    }
    return NextResponse.json({ recorded: true, type });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[integrity] POST:", err);
    return NextResponse.json({ error: "could not record" }, { status: 500 });
  }
}

/**
 * GET /api/interviews/[id]/integrity  recruiter-only
 *
 * Returns the live integrity report for the money screen: the engine
 * aggregates the interview's turns + integrity_events into a risk level and
 * signal list. The candidate-facing report is an entirely separate pipeline —
 * integrity data is never surfaced to the candidate.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let interviewId: string;
  try {
    ({ id: interviewId } = await params);
  } catch {
    return NextResponse.json({ error: "invalid interview id" }, { status: 400 });
  }

  try {
    const { client, interview } = await resolveInterviewAccess(interviewId);

    const [turnsRes, eventsRes] = await Promise.all([
      client.from("turns").select("*").eq("interview_id", interview.id),
      client.from("integrity_events").select("*").eq("interview_id", interview.id),
    ]);
    const turns = turnsRes.data ?? [];
    const events = eventsRes.data ?? [];

    const report = buildIntegrityReport(interviewId, turns as never, events as never     );
    return NextResponse.json(report);
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[integrity] GET:", err);
    return NextResponse.json({ error: "could not load" }, { status: 500 });
  }
}
