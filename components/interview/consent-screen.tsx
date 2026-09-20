"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Door of the interview room. Email (the anonymous gate for link-entered
 * candidates) + an explicit consent checkbox, plus a SEPARATE opt-in for the
 * webcam attention check — camera access is a materially different kind of
 * capture, so it gets its own box and can be declined without blocking the
 * interview. The interview does NOT start until this screen's "Begin" posts to
 * /start, and no camera permission is requested before then.
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
  onBegin: (allowCamera: boolean) => void;
}) {
  const [consented, setConsented] = useState(false);
  const [allowCamera, setAllowCamera] = useState(true);

  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardHeader>
        <CardTitle>Self-service technical interview</CardTitle>
        <CardDescription>
          {candidateName ? `Hi ${candidateName} —` : "Hello —"} this is a {questionCount}-question
          written interview about the position. You answer in text — there is no video call, no
          microphone, and no recording.
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
        <label className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-pretty">
          <input
            type="checkbox"
            checked={allowCamera}
            onChange={(e) => setAllowCamera(e.target.checked)}
            className="mt-0.5 size-4 accent-foreground"
          />
          <span>
            <span className="font-medium">Allow the webcam attention check (optional).</span>{" "}
            If you tick this, your browser will ask for camera permission when the interview
            opens. The video is analysed on your own device to work out roughly when you are
            looking away from the screen. <strong>No video, image, or recording is ever
            uploaded or stored</strong> — only notes like &ldquo;looked away&rdquo; with a
            timestamp. A recruiter sees those notes as context alongside your answers; they are
            never used to automatically reject anyone, and the camera turns off when the
            interview ends. Leaving this unticked, or denying the browser prompt, does not
            affect your interview.
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
          onClick={() => onBegin(allowCamera)}
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