"use client";

import { useEffect, useRef } from "react";
import type { IntegrityEventType } from "@/types";

/** Minimum time between two events of the same type, in ms. */
const DEBOUNCE_MS = 2000;

type ListenerId = "tab_blur" | "window_focus_loss" | "fullscreen_exit" | "paste_event";

/**
 * Best-effort browser-integrity capture for the interview room. Four
 * page-level signals, each debounced to at most one POST per type per 2s so a
 * heavy paste session can't flood the events table:
 *
 *   tab_blur         — the tab lost visibility (user switched tabs/windows)
 *   window_focus_loss — the window lost focus (blur), even if still visible
 *   fullscreen_exit  — left fullscreen (a maximized false-fullscreen interview
 *                      room being restored is a classic "check another window" gesture)
 *   paste_event      — content was pasted anywhere in the document
 *
 * Events carry the client clock (ts) and the question on screen; the events
 * route additionally stamps receivedAt (server time, authoritative) and
 * rejects unknown types. Fire-and-forget: never retried, never surfaced to
 * the candidate, always auditable by the recruiter.
 */
export function useIntegritySignals(opts: {
  interviewId: string;
  email?: string;
  enabled: boolean;
  currentQuestionId?: string | null;
}) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const lastSentRef = useRef<Record<ListenerId, number>>({
    tab_blur: 0,
    window_focus_loss: 0,
    fullscreen_exit: 0,
    paste_event: 0,
  });

  useEffect(() => {
    function record(label: ListenerId, extraPayload?: Record<string, unknown>) {
      const { interviewId, email, enabled, currentQuestionId } = optsRef.current;
      if (!enabled) return;
      const last = lastSentRef.current[label];
      const now = Date.now();
      if (now - last < DEBOUNCE_MS) return;
      lastSentRef.current[label] = now;

      void fetch(`/api/interviews/${interviewId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: label as IntegrityEventType,
          ts: new Date().toISOString(),
          email,
          payload: currentQuestionId
            ? { questionId: currentQuestionId, ...extraPayload }
            : extraPayload,
        }),
      }).catch(() => {
        // fire-and-forget: a failed integrity ping is not worth a retry storm
      });
    }

    function onVisibility() {
      if (document.visibilityState === "hidden") record("tab_blur");
    }
    function onBlur() {
      record("window_focus_loss");
    }
    function onFullscreen() {
      if (!document.fullscreenElement) record("fullscreen_exit");
    }
    function onPaste(e: ClipboardEvent) {
      // Log how much was pasted (capped to a sane value) but never block the
      // paste — pasting is a legitimate input for some candidates.
      const text = e.clipboardData?.getData("text") ?? "";
      record("paste_event", text.length ? { pastedLength: Math.min(text.length, 4096) } : undefined);
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("paste", onPaste);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("paste", onPaste);
    };
    // Handlers read through optsRef so they never go stale; rebinding when the
    // room toggles enabled is enough.
  }, [opts.interviewId, opts.enabled]);
}