"use client";

import { useEffect, useRef } from "react";
import type { ProctorEvent } from "@timadey/proctor";
import type { IntegrityEventType } from "@/types";

/** Minimum time between two gaze POSTs — same budget as the Tier 1 signals. */
const DEBOUNCE_MS = 2000;
/** The library's documented "low mode": ~10% CPU. This runs for the whole
 *  interview on hardware we do not control, so accuracy loses to battery. */
const DETECTION_FPS = 5;

/**
 * Engine event names that mean "eyes left the screen".
 *
 * v1.2.6's VisualDetectionModule emits LOOKING_* / SUSTAINED_LOOK_AWAY; the
 * GAZE_AWAY / PROLONGED_GAZE_AWAY names in its README exist only in a dead
 * EVENT_TYPES constant and are never emitted. Both sets are listed so a version
 * that starts emitting the documented names keeps working — everything else the
 * visual module reports (faces, objects, mouth, head pose) is dropped on the floor.
 */
const GAZE_EVENTS = new Set([
  "LOOKING_LEFT",
  "LOOKING_RIGHT",
  "LOOKING_DOWN",
  "SUSTAINED_LOOK_AWAY",
  "GAZE_AWAY",
  "PROLONGED_GAZE_AWAY",
  "EYES_OFF_SCREEN",
]);

/** Keep a string short and boring before it goes near the events table. */
function short(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v.slice(0, 24) : undefined;
}

/**
 * Tier 2 — webcam gaze signals for the interview room.
 *
 * Frames are analysed in-browser by MediaPipe (via @timadey/proctor) and
 * discarded; only derived {direction, duration} events ever leave the machine,
 * as `gaze_sweep` rows on the same fire-and-forget endpoint the Tier 1 signals
 * use. No video, no image, no landmark data is uploaded or stored.
 *
 * Enabled ONLY after the candidate has passed the consent gate and ticked the
 * camera box — getUserMedia is never called on mount.
 *
 * Fails open, always: a denied camera, a missing WebGL context, a model that
 * won't download or an engine that throws is logged to the console and nothing
 * else. The interview and the Tier 1 signals behave identically without it.
 */
export function useGazeTracking(opts: {
  interviewId: string;
  email?: string;
  enabled: boolean;
  currentQuestionId?: string | null;
}) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const lastSentRef = useRef(0);

  useEffect(() => {
    if (!opts.enabled) return;

    let cancelled = false;
    let stream: MediaStream | null = null;
    let video: HTMLVideoElement | null = null;
    let engine: import("@timadey/proctor").ProctoringEngine | null = null;
    let Engine: typeof import("@timadey/proctor").ProctoringEngine | null = null;

    function record(e: ProctorEvent) {
      const { interviewId, email, enabled, currentQuestionId } = optsRef.current;
      if (!enabled) return;
      const now = Date.now();
      if (now - lastSentRef.current < DEBOUNCE_MS) return;
      lastSentRef.current = now;

      void fetch(`/api/interviews/${interviewId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "gaze_sweep" as IntegrityEventType,
          ts: new Date().toISOString(),
          email,
          // Hand-picked fields only. The engine also attaches extractedFeatures
          // (face/hand landmarks) to every event — that never goes over the wire.
          payload: {
            ...(currentQuestionId ? { questionId: currentQuestionId } : {}),
            signal: short(e.event),
            direction: short(e.direction),
            severity: short(e.severity),
            durationMs:
              typeof e.duration === "number" && Number.isFinite(e.duration)
                ? Math.min(Math.round(e.duration), 600_000)
                : undefined,
          },
        }),
      }).catch(() => {
        // fire-and-forget, exactly like the Tier 1 signals
      });
    }

    function teardown() {
      try {
        engine?.destroy();
      } catch {
        // a half-initialised engine can throw on teardown; nothing to salvage
      }
      // destroy() leaves the static singleton (and its isInitialized flag) set,
      // so without this a later mount gets back a dead engine that silently
      // never emits again.
      if (Engine) Engine.instance = null;
      engine = null;
      // Stopping the tracks is what actually turns the webcam light off.
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      if (video) {
        video.srcObject = null;
        video.remove();
        video = null;
      }
    }

    void (async () => {
      try {
        const { ProctoringEngine } = await import("@timadey/proctor");
        Engine = ProctoringEngine;
        if (cancelled) return;

        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
          audio: false,
        });
        if (cancelled) return teardown();

        // A detached <video> is not reliably painted, so park a 1px invisible
        // one in the document instead of hiding it with display:none.
        video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.setAttribute("aria-hidden", "true");
        video.style.cssText =
          "position:fixed;bottom:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none";
        video.srcObject = stream;
        document.body.appendChild(video);
        await video.play();
        if (cancelled) return teardown();

        engine = ProctoringEngine.getInstance({
          // Gaze only. Audio would open the microphone, pattern detection would
          // correlate signals we deliberately do not collect, and browser
          // telemetry is already the Tier 1 hook's job.
          enableVisualDetection: true,
          enableAudioMonitoring: false,
          enablePatternDetection: false,
          enableBrowserTelemetry: false,
          detectionFPS: DETECTION_FPS,
          onEvent: (e) => {
            if (GAZE_EVENTS.has(e.event)) record(e);
          },
          onError: (err) => console.warn("[gaze] engine error:", err),
        });
        await engine.initialize();
        if (cancelled) return teardown();

        engine.start(video);
      } catch (err) {
        // Denied camera, no WebGL, model download blocked, anything: the
        // interview carries on with zero gaze data.
        console.warn("[gaze] tracking unavailable, continuing without it:", err);
        teardown();
      }
    })();

    return () => {
      cancelled = true;
      teardown();
    };
    // Handlers read through optsRef so they never go stale; rebinding when the
    // room toggles enabled is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.interviewId, opts.enabled]);
}
