"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function useLogout() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logout = async () => {
    setIsLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      setError(error.message);
      setIsLoading(false);
      return;
    }
    router.push("/auth/login");
    router.refresh();
  };

  return { logout, isLoading, error };
}
