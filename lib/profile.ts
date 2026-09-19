import { createClient } from "@/lib/supabase/server";
import type { UserProfile } from "@/types";

export async function getCurrentProfile(): Promise<UserProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, full_name, email, created_at")
    .eq("id", user.id)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    role: data.role,
    fullName: data.full_name,
    email: data.email,
    createdAt: data.created_at,
  };
}
