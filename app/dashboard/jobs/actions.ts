"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseRequirements } from "@/lib/jd/parseRequirements";
import { extractText } from "@/lib/resume/extractText";
import { extractProfile } from "@/lib/extraction/extractProfile";
import { scoreCandidate } from "@/lib/scoring/scoreCandidate";
import type { Evidence, ExtractedField, Requirement } from "@/types";

export type CreateJobState = { error: string | null };
export type ActionResult<T> = ({ ok: true } & T) | { ok: false; error: string };

// Every action below is a public endpoint: re-check the session, and let
// RLS (jobs/candidates/extractions/scores scoped to recruiter_id =
// auth.uid()) decide which rows exist for this user.
async function authedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("You must be signed in.");
  return { supabase, user };
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function grounding(evidence: (Evidence | null)[]) {
  const present = evidence.filter((e): e is Evidence => e !== null);
  return { grounded: present.filter((e) => e.grounded).length, total: present.length };
}

type Supabase = Awaited<ReturnType<typeof authedClient>>["supabase"];

async function saveRequirements(supabase: Supabase, jobId: string, jdText: string) {
  const requirements = await parseRequirements(jdText);
  const { error } = await supabase
    .from("jobs")
    .update({ requirements })
    .eq("id", jobId)
    .select("id")
    .single(); // .single() turns a 0-row (RLS-filtered) update into an error
  if (error) throw new Error(error.message);
}

export async function createJob(
  _prevState: CreateJobState,
  formData: FormData,
): Promise<CreateJobState> {
  const title = String(formData.get("title") ?? "").trim();
  const jdText = String(formData.get("jdText") ?? "").trim();

  if (!title) return { error: "Job title is required." };
  if (!jdText) return { error: "Paste the job description." };

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: "You must be signed in to create a job." };
  }

  const { data, error } = await supabase
    .from("jobs")
    .insert({ recruiter_id: user.id, title, jd_text: jdText, requirements: [] })
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not create job." };
  }

  // The job exists either way; a failed extraction shows up on the job page
  // as an empty requirements list with a retry button.
  try {
    await saveRequirements(supabase, data.id, jdText);
  } catch (err) {
    console.error("[jobs] requirement extraction failed for", data.id, err);
  }

  revalidatePath("/dashboard");
  redirect(`/dashboard/jobs/${data.id}`);
}

/** Retry for jobs whose extraction failed or predates it. Used via useActionState. */
export async function extractRequirements(jobId: string): Promise<CreateJobState> {
  try {
    const { supabase } = await authedClient();
    const { data: job, error } = await supabase
      .from("jobs")
      .select("jd_text")
      .eq("id", jobId)
      .single();
    if (error || !job) return { error: error?.message ?? "Job not found." };
    await saveRequirements(supabase, jobId, job.jd_text);
  } catch (err) {
    console.error("[jobs] requirement extraction failed for", jobId, err);
    return { error: message(err) };
  }
  revalidatePath(`/dashboard/jobs/${jobId}`);
  return { error: null };
}

// ------------------------------------------------------------
// Resume pipeline (B3): the browser uploads the PDF to storage, then calls
// these one stage at a time so each file shows real per-stage progress.
// ------------------------------------------------------------

export async function createCandidate(
  jobId: string,
  resumePath: string,
  fileName: string,
): Promise<ActionResult<{ candidateId: string }>> {
  try {
    const { supabase } = await authedClient();
    // Only accept "<jobId>/<file>" so a candidate can't point at another job's resume.
    const [prefix, file, ...rest] = resumePath.split("/");
    if (prefix !== jobId || !file || rest.length > 0 || file === "." || file === "..") {
      return { ok: false, error: "Invalid resume path." };
    }
    const { data, error } = await supabase
      .from("candidates")
      .insert({
        job_id: jobId,
        name: fileName.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ").trim() || "Unnamed candidate",
        email: "",
        resume_path: resumePath,
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Could not create candidate." };
    return { ok: true, candidateId: data.id };
  } catch (err) {
    return { ok: false, error: message(err) };
  }
}

/** A3: PDF in storage → candidates.resume_text. */
export async function runExtractText(
  candidateId: string,
): Promise<ActionResult<{ chars: number }>> {
  try {
    const { supabase } = await authedClient();
    const { data: candidate, error } = await supabase
      .from("candidates")
      .select("resume_path")
      .eq("id", candidateId)
      .single();
    if (error || !candidate) return { ok: false, error: error?.message ?? "Candidate not found." };

    const { data: blob, error: dlError } = await supabase.storage
      .from("resumes")
      .download(candidate.resume_path);
    if (dlError || !blob) {
      return { ok: false, error: `Could not read the uploaded PDF: ${dlError?.message ?? "empty file"}` };
    }

    const text = await extractText(new Uint8Array(await blob.arrayBuffer()));
    if (text.length < 50) {
      return { ok: false, error: "No readable text in this PDF (is it a scanned image?)." };
    }

    const { error: upError } = await supabase
      .from("candidates")
      .update({ resume_text: text })
      .eq("id", candidateId)
      .select("id")
      .single();
    if (upError) return { ok: false, error: upError.message };
    return { ok: true, chars: text.length };
  } catch (err) {
    console.error("[pipeline] text extraction failed for", candidateId, err);
    return { ok: false, error: message(err) };
  }
}

/** A4: resume_text → extractions row (+ fills in the candidate's name/email). */
export async function runExtractProfile(
  candidateId: string,
): Promise<ActionResult<{ grounded: number; total: number }>> {
  try {
    const { supabase } = await authedClient();
    const { data: candidate, error } = await supabase
      .from("candidates")
      .select("resume_text")
      .eq("id", candidateId)
      .single();
    if (error || !candidate) return { ok: false, error: error?.message ?? "Candidate not found." };
    if (!candidate.resume_text) return { ok: false, error: "Resume text hasn't been extracted yet." };

    const { fields, modelVersion } = await extractProfile(candidate.resume_text);
    const { error: insError } = await supabase
      .from("extractions")
      .insert({ candidate_id: candidateId, fields, model_version: modelVersion });
    if (insError) return { ok: false, error: insError.message };

    const name = fields.find((f) => f.key === "name")?.value;
    const email = fields.find((f) => f.key === "email")?.value;
    const contact = {
      ...(name ? { name } : {}),
      ...(email?.includes("@") ? { email } : {}),
    };
    if (Object.keys(contact).length > 0) {
      const { error: nameError } = await supabase
        .from("candidates")
        .update(contact)
        .eq("id", candidateId);
      if (nameError) console.error("[pipeline] contact update failed for", candidateId, nameError);
    }

    return { ok: true, ...grounding(fields.map((f) => f.evidence)) };
  } catch (err) {
    console.error("[pipeline] profile extraction failed for", candidateId, err);
    return { ok: false, error: message(err) };
  }
}

/** A5: latest extraction + job requirements → scores row. */
export async function runScoreCandidate(candidateId: string): Promise<
  ActionResult<{ score: number; gateFailed: boolean; grounded: number; total: number }>
> {
  try {
    const { supabase } = await authedClient();
    const { data: candidate, error } = await supabase
      .from("candidates")
      .select("job_id, resume_text")
      .eq("id", candidateId)
      .single();
    if (error || !candidate) return { ok: false, error: error?.message ?? "Candidate not found." };

    const [{ data: job, error: jobError }, { data: extraction, error: exError }] = await Promise.all([
      supabase.from("jobs").select("requirements").eq("id", candidate.job_id).single(),
      supabase
        .from("extractions")
        .select("fields")
        .eq("candidate_id", candidateId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (jobError || !job) return { ok: false, error: jobError?.message ?? "Job not found." };
    if (exError) return { ok: false, error: exError.message };
    if (!extraction) return { ok: false, error: "Profile hasn't been extracted yet." };

    const score = await scoreCandidate(
      job.requirements as Requirement[],
      extraction.fields as ExtractedField[],
      candidate.resume_text,
    );
    const { error: insError } = await supabase.from("scores").insert({
      candidate_id: candidateId,
      job_id: candidate.job_id,
      total: score.total,
      breakdown: score.breakdown,
      unproven: score.unproven,
      must_have_gate_failed: score.mustHaveGateFailed,
      gate_reason: score.gateReason,
      rubric_version: score.rubricVersion,
    });
    if (insError) return { ok: false, error: insError.message };

    revalidatePath(`/dashboard/jobs/${candidate.job_id}`);
    return {
      ok: true,
      score: score.total,
      gateFailed: score.mustHaveGateFailed,
      ...grounding(score.breakdown.map((b) => b.evidence)),
    };
  } catch (err) {
    console.error("[pipeline] scoring failed for", candidateId, err);
    return { ok: false, error: message(err) };
  }
}
