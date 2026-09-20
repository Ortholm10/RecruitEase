"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { createClient } from "@/lib/supabase/client";
import { ensureProfile } from "@/app/auth/actions";
import { AuthCard } from "@/components/auth/auth-card";
import { FloatingLabelInput } from "@/components/ui/floating-label-input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import type { UserRole } from "@/types";
import { cn } from "@/lib/utils";

export function SignUpForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<UserRole | "">("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== repeatPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!role) {
      setError("Choose whether you're hiring or applying");
      return;
    }

    setIsLoading(true);
    const supabase = createClient();

    try {
      const nextPath = role === "recruiter" ? "/dashboard" : "/portal";
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, role },
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=${nextPath}`,
        },
      });
      if (error) throw error;

      if (data.session) {
        const result = await ensureProfile();
        if (result.error) {
          setError(`Account created, but profile setup failed: ${result.error}`);
          return;
        }
        router.push(nextPath);
        return;
      }

      router.push("/auth/sign-up-success");
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthCard title="Create Account" subtitle="Sign up to get started with RecruitEase">
      <form onSubmit={handleSignUp} className="space-y-4">
        <div className="space-y-4">
          <div className="relative">
            <User className="pointer-events-none absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2 text-white/40" />
            <FloatingLabelInput
              label="Full name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

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

          <div className="relative">
            <Lock className="pointer-events-none absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2 text-white/40" />
            <FloatingLabelInput
              label="Repeat password"
              type={showPassword ? "text" : "password"}
              required
              value={repeatPassword}
              onChange={(e) => setRepeatPassword(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label id="role-label" className="text-xs text-white/60">
            I&apos;m signing up as
          </Label>
          <RadioGroup
            aria-labelledby="role-label"
            value={role}
            onValueChange={(value) => setRole(value as UserRole)}
            className="grid grid-cols-2 gap-3"
          >
            <Label
              htmlFor="role-recruiter"
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm font-normal text-white/80 transition-colors",
                "has-[[data-state=checked]]:border-white/40 has-[[data-state=checked]]:bg-white/10 has-[[data-state=checked]]:text-white",
              )}
            >
              <RadioGroupItem value="recruiter" id="role-recruiter" className="border-white/30 text-white data-[state=checked]:border-white" />
              Recruiter
            </Label>
            <Label
              htmlFor="role-candidate"
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm font-normal text-white/80 transition-colors",
                "has-[[data-state=checked]]:border-white/40 has-[[data-state=checked]]:bg-white/10 has-[[data-state=checked]]:text-white",
              )}
            >
              <RadioGroupItem value="candidate" id="role-candidate" className="border-white/30 text-white data-[state=checked]:border-white" />
              Candidate
            </Label>
          </RadioGroup>
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
                  Sign Up
                  <ArrowRight className="h-3 w-3 transition-transform duration-300 group-hover/button:translate-x-1" />
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </motion.button>

        <p className="mt-4 text-center text-xs text-white/60">
          Already have an account?{" "}
          <Link href="/auth/login" className="font-medium text-white hover:text-white/70">
            Login
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
