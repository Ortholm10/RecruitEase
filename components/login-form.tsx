"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { createClient } from "@/lib/supabase/client";
import { AuthCard } from "@/components/auth/auth-card";
import { FloatingLabelInput } from "@/components/ui/floating-label-input";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      const userId = data.user?.id;
      if (!userId) throw new Error("Login succeeded but no user was returned.");

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();

      if (profileError || !profile) {
        throw new Error("Your account setup isn't complete yet. Please contact support.");
      }

      router.push(profile.role === "recruiter" ? "/dashboard" : "/portal");
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthCard title="Welcome Back" subtitle="Sign in to continue to RecruitEase">
      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-4">
          <div className="relative">
            <Mail className="pointer-events-none absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2 text-white/40" />
            <FloatingLabelInput
              label="Email address"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="relative">
            <Lock className="pointer-events-none absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2 text-white/40" />
            <FloatingLabelInput
              label="Password"
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute top-1/2 right-3 z-10 -translate-y-1/2 cursor-pointer text-white/40 transition-colors duration-300 hover:text-white"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end pt-1">
          <Link href="/auth/forgot-password" className="text-xs text-white/60 transition-colors duration-200 hover:text-white">
            Forgot password?
          </Link>
        </div>

        {error && (
          <p role="alert" className="text-xs text-red-400">
            {error}
          </p>
        )}

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="submit"
          disabled={isLoading}
          className="group/button relative mt-2 w-full disabled:opacity-60"
        >
          <div className="absolute inset-0 rounded-lg bg-white/10 opacity-0 blur-lg transition-opacity duration-300 group-hover/button:opacity-70" />
          <div className="relative flex h-10 items-center justify-center overflow-hidden rounded-lg bg-white font-medium text-black transition-all duration-300">
            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-black/70 border-t-transparent" />
                </motion.div>
              ) : (
                <motion.span
                  key="button-text"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center justify-center gap-1 text-sm font-medium"
                >
                  Sign In
                  <ArrowRight className="h-3 w-3 transition-transform duration-300 group-hover/button:translate-x-1" />
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </motion.button>

        <p className="mt-4 text-center text-xs text-white/60">
          Don&apos;t have an account?{" "}
          <Link href="/auth/sign-up" className="font-medium text-white hover:text-white/70">
            Sign up
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
