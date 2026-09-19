import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { InterviewPlan, InterviewStatus } from "@/types";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type InterviewRow = {
  id: string;
  candidate_id: string;
  job_id: string;
  plan: InterviewPlan;
  status: InterviewStatus;
  started_at: string | null;
  completed_at: string | null;
};

export const INTERVIEW_COLUMNS =
  "id, candidate_id, job_id, plan, status, started_at, completed_at";

type Context = { client: SupabaseClient; interview: InterviewRow; candidate: { email: string } };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase().replace(/\s+/g, "");
}

/** Small helper to run a maybeSingle select with a strict 422 fast-fail.
 *  Exists purely to keep the read wrapper below terse. */
async function readInterview(client: SupabaseClient, interviewId: string) {
  const { data, error } = await client
    .from("interviews")
    .select(INTERVIEW_COLUMNS)
    .eq("id", interviewId)
    .single();
  if (error || !data) return null;
  return data as InterviewRow;
}

/**
 * Resolves which client may touch this interview, and verifies the caller is
 * allowed to.
 *
 * Two paths, one intent (a candidate interview must never cross from one
 * recruiter's workspace into another's):
 *  1. Recruiter session: RLS already scopes the interviews/candidates reads to
 *     jobs the caller owns. If `email` is supplied it is still verified against
 *     the candidate row (the lightweight candidate entry gate).
 *  2. No session (a real candidate opening the shared link): verified purely by
 *     the candidate email entry — the documented Option-A tradeoff. Service
 *     role is used for the writes, so code-level verification is the ONLY
 *     boundary; on every call the supplied email must match candidate.email.
 */
export async function resolveInterviewAccess(
  interviewId: string,
  email?: string,
): Promise<Context> {
  // Path 1 — an authenticated recruiter who owns the interview's job.
  const server = await createClient();
  const owned = await readInterview(server, interviewId);
  if (owned) {
    const { data: candidate } = await server
      .from("candidates")
      .select("email")
      .eq("id", owned.candidate_id)
      .single();
    if (!candidate) throw new ApiError(404, "Candidate not found.");
    if (email) verifyEmail(email, candidate.email);
    return { client: server, interview: owned, candidate: { email: candidate.email } };
  }

  // Path 2 — session-less candidate via the interview link + email gate.
  const admin = createAdminClient();
  const interview = await readInterview(admin, interviewId);
  if (!interview) throw new ApiError(404, "Interview not found.");
  const { data: candidate } = await admin
    .from("candidates")
    .select("email")
    .eq("id", interview.candidate_id)
    .single();
  if (!candidate) throw new ApiError(404, "Candidate not found.");
  if (!email) throw new ApiError(403, "Candidate email is required.");
  verifyEmail(email, candidate.email);
  return { client: admin, interview, candidate: { email: candidate.email } };
}

function verifyEmail(supplied: string, stored: string): void {
  if (normalizeEmail(supplied) !== normalizeEmail(stored)) {
    throw new ApiError(403, "That email doesn't match the invited candidate.");
  }
}