import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getJobById } from "@/lib/jobs";
import { getCandidateWithScore } from "@/lib/candidates";
import { findLatestInterviewForCandidate, listIntegrityEvents, listTurns } from "@/lib/interview/queries";
import { buildEvaluationReport } from "@/lib/report/buildReport";

/**
 * A9 — Evaluation Report Generator ("the money screen" engine, served).
 *
 * Reads, under normal RLS (row-level security scopes every table to the
 * recruiter that owns the candidate's job), and assembles the flat list of
 * requirement evaluation rows — the recruiter's money screen — purely from
 * data that already exists:
 *   1. the resume Score breakdown (pre-interview evidence per requirement),
 *   2. the Interview plan (which planned question probes which requirement),
 *   3. the answered Interview turns (post-interview evidence per requirement).
 *
 * The pure assembler (lib/report/buildReport.ts) is deterministic and
 * renders movement ("Unproven -> Strong"), remaining gaps, and an outcome
 * recommendation — it NEVER emits a hire/no-hire decision.teed.
 *
 * GET /api/reports/evaluation?candidateId=…&jobId=…
 */
export async function GET(req: NextRequest) {
  const candidateId = req.nextUrl.searchParams.get("candidateId");
  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!candidateId || !jobId) {
    return NextResponse.json(
      { error: "candidateId and jobId are required" },
      { status: 400 },
    );
  }

  const [job, found, interview] = await Promise.all([
    getJobById(jobId),
    getCandidateWithScore(jobId, candidateId),
    findLatestInterviewForCandidate(candidateId),
  ]);
  if (!job || !found) {
    return NextResponse.json({ error: "Candidate or job not found" }, { status: 404 });
  }

  const turns = interview ? await listTurns(interview.id) : [];
  const integrity = interview ? await listIntegrityEvents(interview.id) : [];

  const report = buildEvaluationReport({
    candidateId,
    jobId,
    interviewId: interview?.id ?? "",
    requirements: job.requirements,
    score: { breakdown: found.score?.breakdown ?? [] },
    plan: interview?.plan ?? { id: "", candidateId, jobId, questions: [], generatedAt: "" },
    turns,
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json(report);
}
