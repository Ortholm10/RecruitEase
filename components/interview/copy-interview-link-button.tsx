"use client";

import { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Copies the candidate's interview-room link to the clipboard. The room can
 * be entered directly via this link (no account needed): the candidate queues
 * their email at the door and it is checked against the invited candidate.
 */
export function CopyInterviewLinkButton({ interviewId }: { interviewId: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const host = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${host}/interview/${interviewId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable (e.g. HTTP); fall back to a prompt-less
      // nothing — the link is also visible as text on the page.
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={copy} className="gap-2">
      {copied ? (
        <>
          <Check aria-hidden className="size-4" /> Copied
        </>
      ) : (
        <>
          <Link2 aria-hidden className="size-4" /> Copy interview link
        </>
      )}
    </Button>
  );
}