"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type CreateJobState = { error: string | null };

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

  revalidatePath("/dashboard");
  redirect(`/dashboard/jobs/${data.id}`);
}
