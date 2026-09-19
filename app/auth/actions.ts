"use server";

import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@/types";

/**
 * Creates/updates the profiles row for the currently authenticated user,
 * reading role/full_name from auth signUp() metadata. RLS requires
 * auth.uid() = id, so this only works once a session actually exists —
 * either right after signUp() (email confirmation disabled) or from
 * inside the /auth/confirm route right after verifyOtp() (confirmation
 * enabled), which is why callers can pass that route's own client so the
 * insert runs on the session verifyOtp() just established.
 */
export async function ensureProfile(existingClient?: SupabaseClient) {
  const supabase = existingClient ?? (await createClient());

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Not authenticated.", role: null as UserRole | null };
  }

  const role: UserRole =
    user.user_metadata?.role === "recruiter" ? "recruiter" : "candidate";
  const fullName =
    typeof user.user_metadata?.full_name === "string" &&
    user.user_metadata.full_name.trim().length > 0
      ? user.user_metadata.full_name
      : (user.email ?? "New user");

  const { error } = await supabase.from("profiles").upsert(
    { id: user.id, role, full_name: fullName, email: user.email ?? "" },
    { onConflict: "id" },
  );

  if (error) {
    return { error: error.message, role: null as UserRole | null };
  }

  return { error: null as string | null, role };
}
