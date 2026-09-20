import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { summarizeJobCandidates } from "@/lib/report/summarizeJobCandidates";

/**
 * POST /api/reports/ai-summary   body: { jobId }
 * Runs one LLM call over every scored candidate for the job and returns a
 * JobAiSummary. Nothing is persisted — the client re-requests this on every
 * "AI Report" click. RLS on the underlying reads keeps this scoped to jobs
 * the calling recruiter owns.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { jobId?: string };
  if (!body.jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  try {
    const summary = await summarizeJobCandidates(body.jobId);
    return NextResponse.json(summary);
  } catch (err) {
    console.error("[reports/ai-summary] failed:", err);
    const message = err instanceof Error ? err.message : "Could not generate the AI report.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
