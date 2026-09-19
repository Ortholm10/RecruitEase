import { createClient } from "@/lib/supabase/server";
import type { Interview, InterviewPlan, Turn } from "@/types";

type InterviewRow = {
  id: string;
  candidate_id: string;
  job_id: string;
  plan: InterviewPlan;
  status: Interview["status"];
  started_at: string | null;
  completed_at: string | null;
};

type TurnRow = {
  id: string;
  interview_id: string;
  question_id: string;
  question_type: Turn["questionType"];
  follow_up_depth: number;
  asked_at: string;
  first_word_at: string | null;
  answered_at: string | null;
  transcript: string;
  verdict: Turn["verdict"];
  evidence_linked_requirement: string | null;
};

function mapInterview(r: InterviewRow): Interview {
  return {
    id: r.id,
    candidateId: r.candidate_id,
    jobId: r.job_id,
    plan: r.plan,
    status: r.status,
    startedAt: r.started_at,
    completedAt: r.completed_at,
  };
}

function mapTurn(r: TurnRow): Turn {
  return {
    id: r.id,
    interviewId: r.interview_id,
    questionId: r.question_id,
    questionType: r.question_type,
    followUpDepth: r.follow_up_depth,
    askedAt: r.asked_at,
    firstWordAt: r.first_word_at,
    answeredAt: r.answered_at,
    transcript: r.transcript,
    verdict: r.verdict,
    evidenceLinkedRequirement: r.evidence_linked_requirement,
  };
}

const INTERVIEW_COLUMNS = "id, candidate_id, job_id, plan, status, started_at, completed_at";

/** Any interview for this candidate that is not completed (not_started or
 *  in_progress or abandoned). Used by the idempotent plan route. RLS-scoped. */
export async function findActiveInterviewForCandidate(
  candidateId: string,
): Promise<Interview | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("interviews")
    .select(INTERVIEW_COLUMNS)
    .eq("candidate_id", candidateId)
    .neq("status", "completed")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not load interview: ${error.message}`);
  return data ? mapInterview(data as InterviewRow) : null;
}

/** Prefer the in-flight interview; otherwise the most recently completed.
 *  The interviews table has no created_at column, so "latest" only has
 *  meaning for completed rows (completed_at). */
export async function findLatestInterviewForCandidate(
  candidateId: string,
): Promise<Interview | null> {
  const active = await findActiveInterviewForCandidate(candidateId);
  if (active) return active;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("interviews")
    .select(INTERVIEW_COLUMNS)
    .eq("candidate_id", candidateId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not load interview: ${error.message}`);
  return data ? mapInterview(data as InterviewRow) : null;
}

export async function listTurns(interviewId: string): Promise<Turn[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("turns")
    .select(
      "id, interview_id, question_id, question_type, follow_up_depth, asked_at, first_word_at, answered_at, transcript, verdict, evidence_linked_requirement",
    )
    .eq("interview_id", interviewId)
    .order("asked_at", { ascending: true });
  if (error) throw new Error(`Could not load turns: ${error.message}`);
  return (data as TurnRow[]).map(mapTurn);
}