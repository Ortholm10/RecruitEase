import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError, resolveInterviewAccess } from "@/lib/interview/access";
import type { IntegrityEventRequest } from "@/types";

const VALID_EVENT_TYPES = new Set([
  "tab_blur",
  "window_focus_loss",
  "fullscreen_exit",
  "paste_event",
] as const);

/**
 * POST /api/interviews/[id]/events   body: IntegrityEventRequest
 * Records a browser-integrity signal without the room's high-volume granularity:
 * payload.receivedAt is the SERVER arrival time (authoritative), while
 * payload.ts is what the browser saw. A client that lies about ts is still
 * caught by receivedAt. Debouncing to <=1 event/type/2s is the room's job.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as IntegrityEventRequest & { email?: string };
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body." }, { status: 400 });
    }
    const email = body.email?.trim() || undefined;
    const { interview } = await resolveInterviewAccess(id, email);

    if (interview.status !== "in_progress") {
      return NextResponse.json(
        { error: "Interview is not in progress." },
        { status: 409 },
      );
    }

    if (!VALID_EVENT_TYPES.has(body.type as (typeof VALID_EVENT_TYPES extends Set<infer T> ? T : never))) {
      return NextResponse.json(
        { error: `Unknown integrity event type: ${String(body.type)}` },
        { status: 400 },
      );
    }

    if (!body.ts || Number.isNaN(new Date(body.ts).getTime())) {
      return NextResponse.json({ error: "Invalid event timestamp." }, { status: 400 });
    }

    const receivedAt = new Date().toISOString();
    const inserted = await createAdminClient().from("integrity_events").insert({
      interview_id: interview.id,
      type: body.type,
      ts: new Date(body.ts).toISOString(),
      payload: { receivedAt, ...(body.payload ?? {}) },
    });
    if (inserted.error) {
      console.error("[interviews/events] insert failed:", inserted.error.message);
      return NextResponse.json(
        { error: "Could not record the event." },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, receivedAt });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[interviews/events] failed:", err);
    return NextResponse.json({ error: "Could not record the event." }, { status: 500 });
  }
}