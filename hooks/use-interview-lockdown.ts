"use client";

import { useEffect, useRef } from "react";

/**
 * One departure from the interview window raises SEVERAL DOM events: Alt+Tab
 * fires `blur` and `visibilitychange`, and leaving fullscreen with Esc fires
 * `fullscreenchange` and usually `blur` too. Everything inside this window is
 * treated as a single offence, otherwise one Alt+Tab would burn both strikes
 * at once and the warning would never be seen.
 */
const COALESCE_MS = 1500;

/** Strikes before the interview ends. 1 = warn, 2 = terminate. */
const MAX_STRIKES = 2;

type Reason = "focus_loss" | "tab_hidden" | "fullscreen_exit";

/**
 * Set when WE drop fullscreen on purpose (interview finished or terminated).
 * The resulting fullscreenchange can land before React has detached the
 * listeners, which would otherwise punish a candidate at the exact moment they
 * finished. Module scope because the exit helper is called from outside the hook.
 */
let selfExitUntil = 0;

/**
 * Interview lockdown: fullscreen enforcement + leave-the-window termination.
 *
 * IMPORTANT, and worth repeating wherever this is discussed: a web page cannot
 * *prevent* tab or window switching. Alt+Tab is handled by the OS and Ctrl+Tab
 * is reserved by the browser — neither keystroke is ever delivered to the page,
 * so there is nothing to intercept. Fullscreen is not a lock either: Esc always
 * leaves it, and a second screen or phone is untouched by any of this.
 *
 * What is reliable is detecting the EFFECT of leaving — blur, visibilitychange
 * and fullscreenchange all fire — so that is what this enforces:
 *
 *   strike 1 → warn the candidate, log the warning for the recruiter
 *   strike 2 → terminate: POST /terminate, which flips the interview to
 *              'abandoned' and records the termination evidence
 *
 * Runs alongside useIntegritySignals, which keeps recording the raw signals
 * independently; this hook records the ENFORCEMENT (warned / terminated) on top.
 */
export function useInterviewLockdown(opts: {
  interviewId: string;
  email?: string;
  enabled: boolean;
  currentQuestionId?: string | null;
  onWarn: (strike: number) => void;
  onTerminate: (reason: Reason) => void;
}) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const strikesRef = useRef(0);
  const lastOffenceRef = useRef(0);

  useEffect(() => {
    if (!opts.enabled) return;

    // A terminated room unmounts the listeners, but the POST is fire-and-forget
    // so this guards against a late second offence double-terminating.
    let done = false;

    function offence(reason: Reason) {
      const { enabled, interviewId, email, currentQuestionId } = optsRef.current;
      if (!enabled || done) return;

      const now = Date.now();
      if (now < selfExitUntil) return; // our own teardown, not the candidate
      if (now - lastOffenceRef.current < COALESCE_MS) return;
      lastOffenceRef.current = now;

      const strike = (strikesRef.current += 1);
      const ts = new Date().toISOString();
      const payload = {
        ...(currentQuestionId ? { questionId: currentQuestionId } : {}),
        reason,
        strike,
      };

      if (strike < MAX_STRIKES) {
        // Warning only — log it so the recruiter can see the candidate was told.
        void fetch(`/api/interviews/${interviewId}/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: reason === "fullscreen_exit" ? "fullscreen_exit" : "window_focus_loss",
            ts,
            email,
            payload: { ...payload, warned: true },
          }),
        }).catch(() => {
          // fire-and-forget, same as every other integrity ping
        });
        optsRef.current.onWarn(strike);
        return;
      }

      done = true;
      void fetch(`/api/interviews/${interviewId}/terminate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          reason,
          strikes: strike,
          questionId: currentQuestionId ?? undefined,
        }),
      }).catch(() => {
        // The room still locks the candidate out; answerTurn refuses writes to a
        // non-in_progress interview, and a retry lands on the idempotent branch.
      });
      optsRef.current.onTerminate(reason);
    }

    function onVisibility() {
      if (document.visibilityState === "hidden") offence("tab_hidden");
    }
    function onBlur() {
      offence("focus_loss");
    }
    function onFullscreen() {
      // Only an EXIT counts; entering fullscreen fires this event too.
      if (!document.fullscreenElement) offence("fullscreen_exit");
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreen);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
    // Handlers read through optsRef so they never go stale; rebinding when the
    // room toggles enabled is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.interviewId, opts.enabled]);
}

/** Best-effort fullscreen. Must be called inside a user gesture (the Begin
 *  click, or the warning screen's Return button) or the browser refuses. A
 *  refusal is not fatal: the room still runs, and only real exits are counted. */
export function requestInterviewFullscreen() {
  return document.documentElement.requestFullscreen?.().catch(() => {
    // denied / unsupported — lockdown degrades to focus detection only
  });
}

/** Leaving fullscreen on the way out, without tripping the exit listener
 *  — the exit it triggers is ignored by the offence handler. */
export function exitInterviewFullscreen() {
  selfExitUntil = Date.now() + 2000;
  if (document.fullscreenElement) {
    void document.exitFullscreen?.().catch(() => {});
  }
}
