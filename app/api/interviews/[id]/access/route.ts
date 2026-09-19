import { NextResponse } from "next/server";
import { ApiError, resolveInterviewAccess } from "@/lib/interview/access";

/**
 * POST /api/interviews/[id]/access   body: { email }
 * Lightweight candidate gate. Verifies the supplied email against the
 * interview's candidate row (via the recruiter session OR the session-less
 * service-role path), and returns only the data the room needs. The interview
 * must be active (not_started/in_progress); a completed interview is reported
 * as such so the room can show a done state instead of restarting.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { email?: string };
    const email = body?.email?.trim() ?? "";
    if (!email) {
      return NextResponse.json({ error: "Candidate email is required." }, { status: 400 });
    }
    const { interview, candidate } = await resolveInterviewAccess(id, email);
    if (interview.status === "completed") {
      return NextResponse.json({ error: "This interview has already been completed." }, { status: 409 });
    }
    if (interview.status === "abandoned") {
      return NextResponse.json({ error: "This interview was abandoned." }, { status: 409 });
    }
    return NextResponse.json({
      interviewId: interview.id,
      status: interview.status,
      candidateName: candidate.email.split("@")[0],
      plan: interview.plan,
      progress: { answered: 0, total: interview.plan.questions.length },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[interviews/access] failed:", err);
    return NextResponse.json({ error: "Could not open the interview." }, { status: 500 });
  }
}