import { createClient } from "@/lib/supabase/server";
import type { Job, Requirement } from "@/types";

type JobRow = {
  id: string;
  recruiter_id: string;
  title: string;
  jd_text: string;
  requirements: Requirement[];
  created_at: string;
};

function mapJob(row: JobRow): Job {
  return {
    id: row.id,
    recruiterId: row.recruiter_id,
    title: row.title,
    jdText: row.jd_text,
    requirements: row.requirements ?? [],
    createdAt: row.created_at,
  };
}

const JOB_COLUMNS = "id, recruiter_id, title, jd_text, requirements, created_at";

// RLS ("jobs: recruiter owns") already scopes every query below to rows
// where recruiter_id = auth.uid() — no need to filter again here.
export async function listJobsForCurrentRecruiter(): Promise<Job[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select(JOB_COLUMNS)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return (data as JobRow[]).map(mapJob);
}

export async function getJobById(id: string): Promise<Job | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("jobs")
    .select(JOB_COLUMNS)
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return mapJob(data as JobRow);
}
