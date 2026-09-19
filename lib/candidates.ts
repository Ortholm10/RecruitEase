import { createClient } from "@/lib/supabase/server";
import type { Candidate, Requirement, RequirementScore, Score } from "@/types";

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

// ------------------------------------------------------------
// Cross-job views: the recruiter dashboard's Candidates & Reports
// pages show every candidate across every job the recruiter owns.
// RLS (jobs.recruiter_id = auth.uid()) already scopes the bare
// candidates/scores selects below — no job-id filtering needed here.
// ------------------------------------------------------------

type CandidateRow = {
  id: string;
  job_id: string;
  name: string;
  email: string;
  created_at: string;
};

type CandidateRowWithJob = CandidateRow & {
  job: { id: string; title: string; requirements: Requirement[] } | null;
};

/** Lightweight candidate + latest score + owning job, for the Candidates page. */
export type CandidateWithJob = {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  job: { id: string; title: string; requirements: Requirement[] };
  score: Score | null;
};

export async function listCandidatesForRecruiter(): Promise<CandidateWithJob[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidates")
    .select(
      `id, job_id, name, email, created_at, job:jobs(id, title, requirements), scores(${SCORE_COLUMNS})`,
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load candidates: ${error.message}`);

  return (data as unknown as (CandidateRowWithJob & { scores: ScoreRow[] | null })[]).map((c) => {
    const s = latest(c.scores ?? []);
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      createdAt: c.created_at,
      job: c.job ?? { id: c.job_id, title: "Unknown job", requirements: [] },
      score: s ? mapScore(s) : null,
    };
  });
}

/** Full candidate + latest score + owning job, enough to render EvidenceView. */
export type CandidateAnalysis = {
  candidate: Candidate;
  job: { id: string; title: string; requirements: Requirement[] };
  score: Score | null;
};

export async function listCandidateAnalyses(): Promise<CandidateAnalysis[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidates")
    .select(
      `id, job_id, name, email, resume_path, resume_text, created_at, job:jobs(id, title, requirements), scores(${SCORE_COLUMNS})`,
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load candidates: ${error.message}`);

  return (data as unknown as (CandidateRowWithJob & { resume_path: string; resume_text: string; scores: ScoreRow[] | null })[]).map(
    (c) => {
      const s = latest(c.scores ?? []);
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
        job: c.job ?? { id: c.job_id, title: "Unknown job", requirements: [] },
        score: s ? mapScore(s) : null,
      };
    },
  );
}

/** Total candidates across all of the recruiter's jobs (RLS-scoped). */
export async function countCandidatesForRecruiter(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("candidates")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`Could not count candidates: ${error.message}`);
  return count ?? 0;
}

/** Group a flat candidate list by owning job, jobs sorted by title. */
export type JobSummary = { id: string; title: string; requirements: Requirement[] };

export function groupCandidatesByJob<T extends { job: JobSummary }>(
  rows: T[],
): { job: JobSummary; candidates: T[] }[] {
  const byJob = new Map<string, { job: JobSummary; candidates: T[] }>();
  for (const row of rows) {
    const entry = byJob.get(row.job.id) ?? { job: row.job, candidates: [] };
    entry.candidates.push(row);
    byJob.set(row.job.id, entry);
  }
  return [...byJob.values()].sort((a, b) => a.job.title.localeCompare(b.job.title));
}
