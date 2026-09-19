"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

type State =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "created"; interviewId: string }
  | { status: "error"; message: string };

/**
 * "Start interview" on the candidate detail page. Generates the interview
 * plan via POST /api/interviews (idempotent). The recruiter is NOT taken into
 * the room — the interview is created here and a shareable link shows up in
 * the InterviewPanel below so the candidate can take the test themselves.
 * Plan generation runs one LLM call, so the button shows a spinner while it
 * is in flight.
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
      setState({ status: "created", interviewId: body.interviewId });
      // Re-render the server-driven panel below, which now shows the
      // share-link and live status for this interview.
      router.refresh();
    } catch {
      setState({ status: "error", message: "Network error. Please try again." });
    }
  }

  if (state.status === "created") {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Check aria-hidden className="size-4 text-verdict-strong" />
          Interview ready — share the link below to let the candidate take it.
        </p>
      </div>
    );
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