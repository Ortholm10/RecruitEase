import { createClient } from "@/lib/supabase/server";
import type { Candidate, RequirementScore, Score } from "@/types";

// RLS scopes candidates/scores to jobs owned by auth.uid(). Query errors
// throw (error boundary) rather than rendering as "no candidates".

type ScoreRow = {
  id: string;
  candidate_id: string;
  job_id: string;
  total: number | string; // numeric
  breakdown: RequirementScore[];
  unproven: string[];
  must_have_gate_failed: boolean;
  gate_reason: string | null;
  rubric_version: string;
  created_at: string;
};

const SCORE_COLUMNS =
  "id, candidate_id, job_id, total, breakdown, unproven, must_have_gate_failed, gate_reason, rubric_version, created_at";

function mapScore(r: ScoreRow): Score {
  return {
    id: r.id,
    candidateId: r.candidate_id,
    jobId: r.job_id,
    total: Number(r.total),
    breakdown: r.breakdown ?? [],
    unproven: r.unproven ?? [],
    mustHaveGateFailed: r.must_have_gate_failed,
    gateReason: r.gate_reason,
    rubricVersion: r.rubric_version,
    createdAt: r.created_at,
  };
}

function latest<T extends { created_at: string }>(rows: T[]): T | null {
  return rows.reduce<T | null>((a, b) => (!a || b.created_at > a.created_at ? b : a), null);
}

export type CandidateSummary = Pick<Candidate, "id" | "name" | "email" | "createdAt"> & {
  score: Pick<Score, "total" | "mustHaveGateFailed" | "unproven"> | null;
};

export async function listCandidatesForJob(jobId: string): Promise<CandidateSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidates")
    .select(`id, name, email, created_at, scores(${SCORE_COLUMNS})`)
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load candidates: ${error.message}`);

  return data.map((c) => {
    const s = latest((c.scores ?? []) as ScoreRow[]);
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      createdAt: c.created_at,
      score: s ? mapScore(s) : null,
    };
  });
}

export async function getCandidateWithScore(
  jobId: string,
  candidateId: string,
): Promise<{ candidate: Candidate; score: Score | null } | null> {
  const supabase = await createClient();
  const { data: c, error } = await supabase
    .from("candidates")
    .select(`id, job_id, name, email, resume_path, resume_text, created_at, scores(${SCORE_COLUMNS})`)
    .eq("id", candidateId)
    .eq("job_id", jobId)
    .maybeSingle();
  if (error) throw new Error(`Could not load candidate: ${error.message}`);
  if (!c) return null;

  const s = latest((c.scores ?? []) as ScoreRow[]);
  return {
    candidate: {
      id: c.id,
      jobId: c.job_id,
      name: c.name,
      email: c.email,
      resumePath: c.resume_path,
      resumeText: c.resume_text,
      createdAt: c.created_at,
    },
    score: s ? mapScore(s) : null,
  };
}
