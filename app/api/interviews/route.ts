import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit";
import { getCandidateWithScore } from "@/lib/candidates";
import { getJobById } from "@/lib/jobs";
import { generateInterviewPlan, PLAN_PROMPT_VERSION } from "@/lib/interview/planInterview";
import type { ExtractedField } from "@/types";

/**
 * POST /api/interviews  body: { candidateId }
 * Creates the interview plan for a scored candidate. Idempotent: if a
 * non-completed interview already exists for the candidate it is returned
 * instead of creating a duplicate. Recruiter-session only (RLS scopes the
 * candidate/job reads to jobs the caller owns).
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  let body: { candidateId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const candidateId = body?.candidateId?.trim();
  if (!candidateId) {
    return NextResponse.json({ error: "candidateId is required." }, { status: 400 });
  }

  // RLS-scoped: 0 rows means the recruiter does not own this candidate's job.
  const rows = await supabase
    .from("candidates")
    .select("id, job_id, resume_text")
    .eq("id", candidateId)
    .maybeSingle();
  if (rows.error) {
    return NextResponse.json({ error: rows.error.message }, { status: 500 });
  }
  if (!rows.data) {
    return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
  }

  // Idempotent: reuse any existing non-completed interview.
  const existing = await supabase
    .from("interviews")
    .select("id, status")
    .eq("candidate_id", candidateId)
    .neq("status", "completed")
    .limit(1)
    .maybeSingle();
  if (existing.error) {
    return NextResponse.json({ error: existing.error.message }, { status: 500 });
  }
  if (existing.data) {
    return NextResponse.json({ interviewId: existing.data.id }, { status: 200 });
  }

  const [job, found] = await Promise.all([
    getJobById(rows.data.job_id),
    getCandidateWithScore(rows.data.job_id, candidateId),
  ]);
  if (!job || !found?.score) {
    return NextResponse.json(
      { error: "Candidate has not been scored yet." },
      { status: 400 },
    );
  }

  const extraction = await supabase
    .from("extractions")
    .select("fields")
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (extraction.error || !extraction.data) {
    return NextResponse.json(
      { error: "Profile hasn't been extracted yet." },
      { status: 400 },
    );
  }

  const interviewId = randomUUID();
  try {
    const { plan, model } = await generateInterviewPlan({
      interviewId,
      candidateId,
      jobId: found.candidate.jobId,
      requirements: job.requirements,
      score: found.score,
      fields: extraction.data.fields as ExtractedField[],
      resumeText: found.candidate.resumeText,
    });

    const inserted = await supabase
      .from("interviews")
      .insert({
        id: interviewId,
        candidate_id: candidateId,
        job_id: found.candidate.jobId,
        plan,
        status: "not_started",
      })
      .select("id")
      .single();
    if (inserted.error) {
      return NextResponse.json({ error: inserted.error.message }, { status: 500 });
    }

    await writeAudit({
      entity: "interview",
      entityId: interviewId,
      action: "planned",
      actorId: user.id,
      model,
      promptVersion: PLAN_PROMPT_VERSION,
      sourceRef: JSON.stringify({
        candidateId,
        unproven: found.score.unproven,
        questions: plan.questions.map((q) => q.type),
      }),
    });

    return NextResponse.json({ interviewId }, { status: 201 });
  } catch (err) {
    console.error("[interviews] plan generation failed for", candidateId, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not generate interview plan." },
      { status: 502 },
    );
  }
}