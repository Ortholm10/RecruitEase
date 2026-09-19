"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { extractRequirements, type CreateJobState } from "@/app/dashboard/jobs/actions";

export function ExtractRequirementsButton({ jobId }: { jobId: string }) {
  const [state, action, pending] = useActionState<CreateJobState>(
    extractRequirements.bind(null, jobId),
    { error: null },
  );
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <Button type="submit" disabled={pending} className="gap-2">
        {pending && <Loader2 aria-hidden className="size-4 motion-safe:animate-spin" />}
        {pending ? "Extracting requirements..." : "Extract requirements"}
      </Button>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
