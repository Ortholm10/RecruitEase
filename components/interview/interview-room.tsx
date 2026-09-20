"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArtifactView } from "@/components/interview/artifact-view";
import { ConsentScreen } from "@/components/interview/consent-screen";
import { Timer } from "@/components/interview/timer";
import { useGazeTracking } from "@/hooks/use-gaze-tracking";
import {
  exitInterviewFullscreen,
  requestInterviewFullscreen,
  useInterviewLockdown,
} from "@/hooks/use-interview-lockdown";
import { useIntegritySignals } from "@/hooks/use-integrity-signals";
import { canaryDirective } from "@/lib/interview/canary";
import { cn } from "@/lib/utils";
import type { InterviewPlan, InterviewStateResponse, ServedQuestion } from "@/types";

type Phase = "gate" | "chat" | "done" | "terminated";

type SavedState = { email?: string; pending?: { questionId: string; depth: number; prompt: string; servedAt: string } };

function storageKey(interviewId: string) {
  return `re-iv-${interviewId}`;
}

function readSaved(interviewId: string): SavedState {
  try {
    const raw = localStorage.getItem(storageKey(interviewId));
    return raw ? (JSON.parse(raw) as SavedState) : {};
  } catch {
    return {};
  }
}

function writeSaved(interviewId: string, value: SavedState) {
  try {
    localStorage.setItem(storageKey(interviewId), JSON.stringify(value));
  } catch {
    // private mode / storage disabled — recovery degrades but the interview still works
  }
}

/**
 * The candidate's interview room. One screen, no route hopping:
 *   gate (email + consent) → chat (serve question, answer, get next) → done.
 * The plan is created by the recruiter beforehand; this room only LIVES the
 * plan. Follow-up prompts that a reload would lose are parked in localStorage
 * so a refresh resumes the exact on-screen question.
 */
export function InterviewRoom({ interviewId }: { interviewId: string }) {
  const [phase, setPhase] = useState<Phase>("gate");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [candidateName, setCandidateName] = useState<string | null>(null);
  const [plan, setPlan] = useState<InterviewPlan | null>(null);
  const [progress, setProgress] = useState({ answered: 0, total: 0 });
  const [current, setCurrent] = useState<ServedQuestion | null>(null);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Set by the consent screen's separate camera box; never assumed.
  const [allowCamera, setAllowCamera] = useState(false);
  // Lockdown: one warning, then the interview ends.
  const [warning, setWarning] = useState(false);
  const firstWordRef = useRef<string | null>(null);

  // Browser-integrity signals: only while the chat is live, keyed to the
  // question on screen. Fire-and-forget POSTs, debounced per type.
  useIntegritySignals({
    interviewId,
    email: email || undefined,
    enabled: phase === "chat",
    currentQuestionId: current?.id ?? null,
  });

  // Tier 2 — webcam gaze signals, behind the same gate plus the candidate's
  // explicit camera opt-in. Fails open: if this never initialises, the room and
  // the Tier 1 signals above are unaffected.
  useGazeTracking({
    interviewId,
    email: email || undefined,
    enabled: phase === "chat" && allowCamera,
    currentQuestionId: current?.id ?? null,
  });

  // Fullscreen lockdown. Leaving the interview window warns once, then ends the
  // interview. A browser cannot BLOCK Alt+Tab (the OS eats the keystroke), so
  // this detects the departure rather than pretending to prevent it.
  useInterviewLockdown({
    interviewId,
    email: email || undefined,
    enabled: phase === "chat",
    currentQuestionId: current?.id ?? null,
    onWarn: () => setWarning(true),
    onTerminate: () => {
      setWarning(false);
      setPhase("terminated");
      exitInterviewFullscreen();
    },
  });

  // Resume-on-mount: if an email is already stored, ask the server where the
  // interview stands. Mid-interview reloads land straight back in the chat.
  useEffect(() => {
    const saved = readSaved(interviewId);
    if (!saved.email) return;
    setEmail(saved.email);
    fetch(`/api/interviews/${interviewId}/state?email=${encodeURIComponent(saved.email)}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as Partial<InterviewStateResponse> & { error?: string };
        if (res.status === 404) {
          setError(body.error ?? "This interview could not be found.");
          return;
        }
        if (res.status === 403) {
          // untouched fallthrough: the stored email is stale, re-gate
          return;
        }
        if (res.ok && body.status === "completed") {
          setPhase("done");
          return;
        }
        if (res.ok && body.status === "abandoned") {
          setPhase("terminated");
          return;
        }
        if (res.ok && body.status === "in_progress" && body.servedQuestion) {
          let served = body.servedQuestion;
          if (
            served.followUpDepth > 0 &&
            saved.pending &&
            saved.pending.questionId === served.id &&
            saved.pending.depth === served.followUpDepth
          ) {
            served = { ...served, prompt: saved.pending.prompt, servedAt: saved.pending.servedAt };
          }
          applyQuestion(served, body.plan ?? null, body.progress?.answered ?? 0);
        } else if (res.ok && body.status === "in_progress") {
          // in_progress with nothing left to serve only happens if the plan was
          // exhausted without a completed status — treat it as finished.
          setPhase("done");
        }
        // not_started → stay on the gate with the email prefilled
      })
      .catch(() => {
        // network blip: stay on the gate and let the candidate try the checkbox
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interviewId]);

  function applyQuestion(served: ServedQuestion, p: InterviewPlan | null, answered: number) {
    setCurrent(served);
    setAnswer("");
    firstWordRef.current = null;
    if (p) {
      setPlan(p);
      setProgress({ answered, total: p.questions.length });
    } else {
      setProgress((prev) => ({ ...prev, answered }));
    }
    // Follow-ups must survive a reload: the state endpoint cannot reproduce a
    // model-drafted prompt, so the exact text we showed lives here instead.
    // A planned (depth-0) question clears any stale follow-up slot.
    if (served.followUpDepth > 0) {
      const saved = readSaved(interviewId);
      writeSaved(interviewId, {
        ...saved,
        pending: { questionId: served.id, depth: served.followUpDepth, prompt: served.prompt, servedAt: served.servedAt },
      });
    } else {
      const saved = readSaved(interviewId);
      writeSaved(interviewId, { ...saved, pending: undefined });
    }
    setPhase("chat");
  }

  async function begin(cameraAllowed: boolean) {
    setAllowCamera(cameraAllowed);
    // Must happen synchronously inside the click gesture — after the awaits
    // below the browser no longer treats this as user-initiated.
    void requestInterviewFullscreen();
    setBusy(true);
    setError(null);
    try {
      const ares = await fetch(`/api/interviews/${interviewId}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const abody = (await ares.json().catch(() => ({}))) as Partial<InterviewStateResponse> & { error?: string };
      if (!ares.ok) {
        if (ares.status === 409 && abody.error?.includes("completed")) {
          writeSaved(interviewId, { email });
          setPhase("done");
          return;
        }
        if (ares.status === 409 && abody.error?.includes("abandoned")) {
          writeSaved(interviewId, { email, pending: undefined });
          setPhase("terminated");
          return;
        }
        setError(abody.error ?? "Could not open the interview.");
        return;
      }

      setCandidateName(abody.candidateName ?? null);
      writeSaved(interviewId, { email });
      const interviewed: boolean = abody.status === "in_progress";

      let served: ServedQuestion | null = null;
      if (interviewed) {
        const sres = await fetch(`/api/interviews/${interviewId}/state?email=${encodeURIComponent(email)}`);
        const sbody = (await sres.json().catch(() => ({}))) as InterviewStateResponse & { error?: string };
        if (sres.ok && sbody.servedQuestion) {
          served = { ...sbody.servedQuestion };
          const saved = readSaved(interviewId);
          if (
            served.followUpDepth > 0 &&
            saved.pending &&
            saved.pending.questionId === served.id &&
            saved.pending.depth === served.followUpDepth
          ) {
            served = { ...served, prompt: saved.pending.prompt, servedAt: saved.pending.servedAt };
          }
          applyQuestion(served, sbody.plan, sbody.progress.answered);
          return;
        }
        // in_progress but nothing to serve: race with our own resume→start ordering
        setError("Your interview is mid-flight. Refresh the page.");
        return;
      }

      const sres = await fetch(`/api/interviews/${interviewId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const sbody = (await sres.json().catch(() => ({}))) as InterviewStateResponse & { error?: string };
      if (sres.ok && sbody.servedQuestion) {
        applyQuestion(sbody.servedQuestion, abody.plan ?? sbody.plan, 0);
        return;
      }
      if (sres.status === 409) {
        // already started elsewhere — resume instead of treating as an error
        const resume = await fetch(`/api/interviews/${interviewId}/state?email=${encodeURIComponent(email)}`).catch(() => null);
        if (resume?.ok) {
          const rbody = (await resume.json()) as InterviewStateResponse;
          if (rbody.servedQuestion) {
            applyQuestion(rbody.servedQuestion, rbody.plan, rbody.progress.answered);
            return;
          }
        }
      }
      setError(sbody.error ?? "Could not start the interview.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (submitting || !current) return;
    if (answer.trim().length > 0 && answer.trim().length < 3) {
      setError("Your answer looks too short — please give a little more detail.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const payload = {
      questionId: current.id,
      followUpDepth: current.followUpDepth,
      transcript: answer,
      firstWordAt: firstWordRef.current,
      answeredAt: new Date().toISOString(),
      servedAt: current.servedAt,
      promptServed: current.prompt,
      email,
    };
    try {
      // The classification can 503 after a rate limit — with NO row written,
      // so re-sending this exact payload is always safe.
      const res = await fetch(`/api/interviews/${interviewId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as { done?: boolean; next?: ServedQuestion; error?: string };
      if (!res.ok) {
        setError(body.error ?? "Could not process the answer. Try again.");
        return;
      }
      if (body.done || !body.next) {
        writeSaved(interviewId, { email, pending: undefined });
        setPhase("done");
        exitInterviewFullscreen();
        return;
      }
      if (current.followUpDepth > 0) {
        writeSaved(interviewId, { email, pending: undefined });
      }
      applyQuestion(body.next, plan, progress.answered + 1);
    } catch {
      setError("Network error. Nothing was submitted — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === "terminated") {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-start justify-center gap-4">
        <h1 className="text-2xl font-semibold text-destructive">Interview ended</h1>
        <p className="text-muted-foreground text-pretty">
          You left the interview window after being warned, so this interview was ended
          automatically and cannot be resumed. The answers you had already submitted have been
          kept and sent to the recruiter along with a record of what happened.
        </p>
        <p className="text-sm text-muted-foreground text-pretty">
          If you believe this was a mistake — a notification stealing focus, assistive software,
          or a device issue — contact the recruiter directly. You can close this tab.
        </p>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-lg flex-col items-start justify-center gap-4">
        <h1 className="text-2xl font-semibold">Interview complete</h1>
        <p className="text-muted-foreground text-pretty">
          Thanks{email ? ` ${candidateName ?? ""}` : ""} — your answers have been recorded and will be
          reviewed. You can close this tab.
        </p>
        <button
          type="button"
          onClick={() => {
            const saved = readSaved(interviewId);
            writeSaved(interviewId, { email: saved.email, pending: undefined });
            localStorage.removeItem(storageKey(interviewId));
            setPhase("gate");
            setCurrent(null);
          }}
          className="text-sm text-muted-foreground underline hover:text-foreground"
        >
          Take a different interview
        </button>
      </div>
    );
  }

  if (phase === "gate") {
    return (
      <ConsentScreen
        email={email}
        onEmailChange={setEmail}
        candidateName={candidateName}
        questionCount={plan?.questions.length ?? 0}
        busy={busy}
        error={error}
        onBegin={begin}
      />
    );
  }

  if (!current || !plan) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading interview…</p>
      </div>
    );
  }

  const qIndex = plan.questions.findIndex((q) => q.id === current.id);
  const label = current.followUpDepth > 0
    ? `Follow-up on question ${qIndex >= 0 ? qIndex + 1 : "?"}`
    : `Question ${qIndex >= 0 ? qIndex + 1 : "?"} of ${plan.questions.length}`;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-6">
      {/* Rendered OVER the chat, never instead of it: unmounting the chat would
          remount Timer and restart a rapid-fire countdown from zero. */}
      {warning ? (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="lockdown-warning"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-destructive/95 p-6 text-center text-destructive-foreground"
        >
          <h1 id="lockdown-warning" className="text-3xl font-semibold">
            Do not leave the interview window
          </h1>
          <p className="max-w-md text-pretty">
            Switching tabs, switching windows, or leaving fullscreen is recorded. This is your
            only warning — <strong>the next time it happens this interview will end immediately</strong>{" "}
            and the recruiter will be notified.
          </p>
          <p className="max-w-md text-sm opacity-90 text-pretty">
            Your timer is still running. Close any notifications before continuing.
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              // The click is the gesture that lets us re-enter fullscreen.
              void requestInterviewFullscreen();
              setWarning(false);
            }}
          >
            Return to the interview
          </Button>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {progress.answered} answered · {progress.total} total
        </p>
        {current.timeLimitSeconds != null ? (
          <Timer seconds={current.timeLimitSeconds} onExpire={submit} />
        ) : null}
      </div>

      <div
        className={cn(
          "rounded-xl border bg-card p-5 shadow-xs",
          current.followUpDepth > 0 && "ring-2 ring-primary/20",
        )}
      >
        <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
          {current.requirementId ? ` · ${current.requirementId}` : ""}
        </p>
        <p className="text-lg font-medium whitespace-pre-wrap text-pretty">{current.prompt}</p>
        {/* Tier 3 canary: hidden from human view (sr-only) but readable by a
            screen-scraping tool. Derived from the question id only, so the
            server can verify it without the room sending anything extra and
            nothing canary-related is ever persisted. */}
        <span className="sr-only pointer-events-none select-none">
          {canaryDirective(current.id)}
        </span>
        {current.type === "artifact" && current.artifactPayload ? (
          <ArtifactView payload={current.artifactPayload} />
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Textarea
          value={answer}
          onChange={(e) => {
            setAnswer(e.target.value);
            if (error) setError(null);
            if (firstWordRef.current === null && e.target.value.trim().length > 0) {
              firstWordRef.current = new Date().toISOString();
            }
          }}
          placeholder="Type your answer here…"
          rows={6}
          autoFocus={current.followUpDepth === 0}
        />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground text-pretty">
            Answers are recorded verbatim. Rapid-fire questions submit automatically when the timer
            ends.
          </p>
          <Button type="button" onClick={submit} disabled={submitting || (!answer.trim() && !current.timeLimitSeconds)} className="gap-2">
            {submitting ? (
              <>
                <Loader2 aria-hidden className="size-4 motion-safe:animate-spin" /> Assessing…
              </>
            ) : (
              <>
                <Send aria-hidden className="size-4" /> Submit answer
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}