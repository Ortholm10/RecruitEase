"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Door of the interview room. Email (the anonymous gate for link-entered
 * candidates) + an explicit consent checkbox. The interview does NOT start
 * until this screen's "Begin" posts to /start.
 */
export function ConsentScreen({
  email,
  onEmailChange,
  candidateName,
  questionCount,
  busy,
  error,
  onBegin,
}: {
  email: string;
  onEmailChange: (v: string) => void;
  candidateName: string | null;
  questionCount: number;
  busy: boolean;
  error: string | null;
  onBegin: () => void;
}) {
  const [consented, setConsented] = useState(false);

  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardHeader>
        <CardTitle>Self-service technical interview</CardTitle>
        <CardDescription>
          {candidateName ? `Hi ${candidateName} —` : "Hello —"} this is a {questionCount}-question
          written interview about the position. You answer in text; no camera, no microphone, no
          video call.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="room-email">Email used for this application</Label>
          <Input
            id="room-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <label className="flex items-start gap-2 text-sm text-pretty">
          <input
            type="checkbox"
            checked={consented}
            onChange={(e) => setConsented(e.target.checked)}
            className="mt-0.5 size-4 accent-foreground"
          />
          <span>
            I agree that my written answers will be reviewed and scored, and that basic
            browser focus/clipboard signals are monitored during the interview for integrity.
            I understand this is not a live proctored session.
          </span>
        </label>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button
          type="button"
          disabled={busy || !email.trim() || !consented}
          onClick={onBegin}
          className="gap-2"
        >
          {busy ? (
            <>
              <Loader2 aria-hidden className="size-4 motion-safe:animate-spin" /> Opening interview…
            </>
          ) : (
            "Begin interview"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}