"use client";

import { useEffect, useRef } from "react";
import type { IntegrityEventType } from "@/types";

/**
 * Live browser-behavior recorder for a running interview (Tier 1 capture).
 *
 * Mounts on the candidate interview room for the duration of the interview.
 * The moment one of the four browser sensors fires — tab loses visibility,
 * text is pasted into the answer box, the window loses focus, or fullscreen
 * is exited — this posts it to POST /api/interviews/[id]/integrity, which
 * persists a real integrity_events row. The engine aggregates those rows into
 * a live risk level that IntegrityPanel renders during the interview.
 *
 * This recorder feeds the integrity engine ONLY. Integrity data is never
 * surfaced to the candidate — it exists for the recruiter's evidence review.
 */
export function IntegrityRecorder({
  interviewId,
  turns,
  enabled,
}: {
  interviewId: string;
  turns: { id: string; answeredAt: string | null }[];
  enabled: boolean;
}) {
  const lastPasteAt = useRef<number>(0);

  useEffect(() => {
    if (!enabled || !interviewId) return;

    const activeTurnId = turns.find((t) => t.answeredAt === null)?.id ?? null ??
      turns[turns.length - 1]?.id ?? null;

    const send = (type: IntegrityEventType, payload: Record<string, unknown> = {}) => {
      void fetch(`/api/interviews/${interviewId}/integrity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          turn_id: activeTurnId,
          payload,
        }),
      }).catch(() => {
        // Best-effort: a failed sensor write never disrupts the interview.
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        send("tab_blur", { at: new Date().toISOString() });
      }
    };

    const onWindowBlur = () => {
      send("window_focus_loss", { at: new Date().toISOString() });
    };

    const onPaste = () => {
      const now = Date.now();
      if (now - lastPasteAt.current < 500) return; // only fire once per discrete paste
      lastPasteAt.current = now;
      send("paste_event", { at: new Date().toISOString() });
    };

    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        send("fullscreen_exit", { at: new Date().toISOString() });
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("paste", onPaste);
    document.addEventListener("fullscreenchange", onFullscreenChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [interviewId, enabled, turns]);

  return null;
}
