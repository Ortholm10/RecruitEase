import { getCandidateWithScore } from "@/lib/candidates";
import { getJobById } from "@/lib/jobs";
import { getRequirementsForJob } from "@/lib/requirements";
import { listTurns, findLatestInterviewForCandidate } from "@/lib/interview/queries";
import { buildEvaluationReport } from "@/lib/report/buildReport";
import type { EvaluationReport } from "@/types";

/**
 * A9 — ties the pure, deterministic report assembler (buildReport.ts) to the
 * real, RLS-scoped rows. Single import shared by BOTH the API route and the
 * money-screen RSC so the recruiter sees byte-for-byte the same report.
 *
 * No LLM call, no DB write, no "hire" verdict — only evidence + verdicts.
 * Throws when the candidate/score/job is missing (route maps that to 404).
 */
export async function loadEvaluationReport(opts: {
  candidateId: string;
  jobId: string;
}): Promise<{ report: EvaluationReport; candidateName: string; jobTitle: string; interviewId: string }> {
  const job = await getJobById(opts.jobId);
  if (!job) throw new Error("Job not found");

  const found = await getCandidateWithScore(opts.jobId, opts.candidateId);
  if (!found) throw new Error("Candidate not found");

  const interview = await findLatestInterviewForCandidate(opts.candidateId);
  if (!interview) throw new Error("No interview found");
  if (interview.status !== "completed")
    throw new Error("Interview not complete", { cause: { code: "interview_pending" } });

  const [requirements, turns] = await Promise.all([
    getRequirementsForJob(opts.jobId),
    listTurns(interview.id),
  ]);

  const report = buildEvaluationReport({
    candidateId: opts.candidateId,
    jobId: opts.jobId,
    interviewId: interview.id,
    requirements,
    score: { breakdown: found.score?.breakdown ?? [] },
    plan: interview.plan,
    turns,
    createdAt: new Date().toISOString(),
  });

  return {
    report,
    candidateName: found.candidate.name,
    jobTitle: job.title,
    interviewId: interview.id,
  };
}
