"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "error"; message: string };

/**
 * "Start interview" on the candidate detail page. Generates the interview
 * plan via POST /api/interviews (idempotent) and deep-links into the
 * interview room. Plan generation runs one LLM call, so the button shows
 * a spinner while it is in flight.
 */
export function StartInterviewButton({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "idle" });

  async function start() {
    setState({ status: "pending" });
    try {
      const res = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId }),
      });
      const body = (await res.json().catch(() => ({}))) as { interviewId?: string; error?: string };
      if (!res.ok || !body.interviewId) {
        setState({ status: "error", message: body.error ?? "Could not start the interview." });
        return;
      }
      router.push(`/interview/${body.interviewId}`);
    } catch {
      setState({ status: "error", message: "Network error. Please try again." });
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" onClick={start} disabled={state.status === "pending"} className="gap-2">
        {state.status === "pending" ? (
          <Loader2 aria-hidden className="size-4 motion-safe:animate-spin" />
        ) : (
          <Play aria-hidden className="size-4" />
        )}
        {state.status === "pending" ? "Building interview plan..." : "Start interview"}
      </Button>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
    </div>
  );
}