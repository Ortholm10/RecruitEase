"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Countdown for rapid-fire questions. Auto-submits on expiry via onExpire
 * (with whatever text is in the box — possibly empty, which is recorded as
 * an empty turn). Uses the client clock from when the question was shown on
 * screen, which is the honest measure of how long the candidate had it.
 */
export function Timer({
  seconds,
  onExpire,
}: {
  seconds: number;
  onExpire: () => void;
}) {
  const [remaining, setRemaining] = useState(seconds);
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
    setRemaining(seconds);
    const deadline = Date.now() + seconds * 1000;
    const id = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0 && !firedRef.current) {
        firedRef.current = true;
        window.clearInterval(id);
        onExpire();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [seconds, onExpire]);

  const danger = remaining <= 5;

  return (
    <div
      role="timer"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold tabular-nums",
        danger ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground",
      )}
    >
      <span aria-hidden className={cn("size-2 rounded-full", danger ? "bg-destructive" : "bg-primary")} />
      {remaining}s left
    </div>
  );
}