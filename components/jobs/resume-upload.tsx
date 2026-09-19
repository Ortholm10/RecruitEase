"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { CircleCheck, CircleX, Clock, FileUp, Loader2, RotateCw, TriangleAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  createCandidate,
  runExtractProfile,
  runExtractText,
  runScoreCandidate,
} from "@/app/dashboard/jobs/actions";

const MAX_BYTES = 10 * 1024 * 1024; // matches the bucket's cap
const STEPS = ["upload", "text", "profile", "score"] as const;
type Step = (typeof STEPS)[number];
const STEP_LABEL: Record<Step, string> = {
  upload: "Uploading",
  text: "Reading PDF",
  profile: "Extracting profile",
  score: "Scoring",
};

type Quotes = { grounded: number; total: number };
type Item = {
  key: string;
  file: File;
  status: "queued" | "running" | "done" | "failed";
  step: Step;
  error?: string;
  retryable?: boolean;
  path?: string;
  candidateId?: string;
  chars?: number;
  profileQuotes?: Quotes;
  scoreQuotes?: Quotes;
  result?: { score: number; gateFailed: boolean };
};

function validate(file: File): string | null {
  if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) return "Only PDF files are accepted.";
  if (file.size > MAX_BYTES) return "Larger than the 10 MB limit.";
  return null;
}

/** Low-confidence signal: little text, or many quotes findQuote couldn't locate. */
function quality(item: Item): { warning: string | null; note: string | null } {
  if (item.chars !== undefined && item.chars < 600) {
    return { warning: `Only ${item.chars} characters of text came out of this PDF. It may be partly scanned.`, note: null };
  }
  const qs = [item.profileQuotes, item.scoreQuotes].filter((q): q is Quotes => !!q);
  const total = qs.reduce((s, q) => s + q.total, 0);
  const missing = total - qs.reduce((s, q) => s + q.grounded, 0);
  if (total > 0 && missing / total > 0.2) {
    return { warning: `${missing} of ${total} quotes couldn't be located in the resume text. Check the evidence before trusting this score.`, note: null };
  }
  return { warning: null, note: missing > 0 ? `${missing} of ${total} quotes unverified` : null };
}

export function ResumeUpload({ jobId, disabled }: { jobId: string; disabled?: boolean }) {
  const inputId = useId();
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const jobs = useRef<(() => Promise<void>)[]>([]);
  const running = useRef(false);

  const patch = (key: string, p: Partial<Item>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...p } : i)));

  // One stage at a time per file, one file at a time: real per-stage progress,
  // and friendly to free-tier LLM rate limits.
  // ponytail: sequential batch; add bounded concurrency if batches get large.
  async function drain() {
    if (running.current) return;
    running.current = true;
    try {
      while (jobs.current.length) await jobs.current.shift()!();
    } finally {
      running.current = false;
    }
  }

  async function run(item: Item, from: Step) {
    const { key, file } = item;
    let { path, candidateId } = item;

    const stages: Record<Step, () => Promise<string | null>> = {
      upload: async () => {
        if (!path) {
          const target = `${jobId}/${file.name.replace(/[^\w.-]+/g, "_")}`;
          const { error } = await createClient()
            .storage.from("resumes")
            .upload(target, file, { contentType: "application/pdf", upsert: false });
          if (error) {
            return /exist|duplicate/i.test(error.message)
              ? "A resume with this file name is already on this job. Rename the file to upload it again."
              : error.message;
          }
          path = target;
          patch(key, { path });
        }
        const res = await createCandidate(jobId, path, file.name);
        if (!res.ok) return res.error;
        candidateId = res.candidateId;
        patch(key, { candidateId });
        return null;
      },
      text: async () => {
        const res = await runExtractText(candidateId!);
        if (!res.ok) return res.error;
        patch(key, { chars: res.chars });
        return null;
      },
      profile: async () => {
        const res = await runExtractProfile(candidateId!);
        if (!res.ok) return res.error;
        patch(key, { profileQuotes: { grounded: res.grounded, total: res.total } });
        return null;
      },
      score: async () => {
        const res = await runScoreCandidate(candidateId!);
        if (!res.ok) return res.error;
        patch(key, {
          scoreQuotes: { grounded: res.grounded, total: res.total },
          result: { score: res.score, gateFailed: res.gateFailed },
        });
        return null;
      },
    };

    for (const step of STEPS.slice(STEPS.indexOf(from))) {
      patch(key, { status: "running", step, error: undefined });
      let error: string | null;
      try {
        error = await stages[step]();
      } catch (err) {
        error = err instanceof Error ? err.message : "Unexpected error.";
      }
      if (error) {
        patch(key, { status: "failed", error, retryable: true });
        return;
      }
    }
    patch(key, { status: "done" });
  }

  function enqueue(files: File[]) {
    if (disabled || files.length === 0) return;
    const fresh: Item[] = files.map((file) => {
      const error = validate(file);
      return { key: crypto.randomUUID(), file, step: "upload", status: error ? "failed" : "queued", error: error ?? undefined };
    });
    setItems((prev) => [...prev, ...fresh]);
    for (const item of fresh) if (item.status === "queued") jobs.current.push(() => run(item, "upload"));
    void drain();
  }

  function retry(item: Item) {
    patch(item.key, { status: "queued", error: undefined });
    jobs.current.push(() => run(item, item.step));
    void drain();
  }

  const finished = items.filter((i) => i.status === "done").length;
  const failed = items.filter((i) => i.status === "failed").length;

  return (
    <div className="flex flex-col gap-4">
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          enqueue(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors duration-150 has-[:focus-visible]:border-ring has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
          dragging ? "border-primary bg-muted" : "hover:bg-muted/50",
          disabled && "cursor-not-allowed opacity-60 hover:bg-transparent",
        )}
      >
        <FileUp aria-hidden className="size-6 text-muted-foreground" />
        <span className="text-sm font-medium">
          Drop resumes here or <span className="underline underline-offset-4">browse</span>
        </span>
        <span className="text-xs text-muted-foreground">
          {disabled ? "Extract the job's requirements first." : "PDF only, up to 10 MB each. Select as many as you like."}
        </span>
        <input
          id={inputId}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          disabled={disabled}
          className="sr-only"
          onChange={(e) => {
            enqueue(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </label>

      {items.length > 0 && (
        <>
          <p role="status" className="text-sm text-muted-foreground tabular-nums">
            {finished} of {items.length} resumes processed{failed > 0 && `, ${failed} need attention`}
          </p>
          <ul className="divide-y rounded-lg border">
            {items.map((item) => (
              <UploadRow key={item.key} item={item} jobId={jobId} onRetry={() => retry(item)} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function UploadRow({ item, jobId, onRetry }: { item: Item; jobId: string; onRetry: () => void }) {
  const { warning, note } = quality(item);
  const stepIndex = STEPS.indexOf(item.step);
  // Validation failures (not a PDF, too big) never entered the pipeline: no step bar.
  const inPipeline = item.status === "running" || item.status === "queued" || (item.status === "failed" && item.retryable);
  const Icon =
    item.status === "failed" ? CircleX
    : item.status === "queued" ? Clock
    : item.status === "running" ? Loader2
    : warning ? TriangleAlert
    : CircleCheck;

  return (
    <li className="flex items-start gap-3 p-3">
      <Icon
        aria-hidden
        className={cn(
          "mt-0.5 size-4 shrink-0",
          item.status === "running" && "text-muted-foreground motion-safe:animate-spin",
          item.status === "queued" && "text-muted-foreground",
          item.status === "failed" && "text-destructive",
          item.status === "done" && (warning ? "text-verdict-partial" : "text-verdict-strong"),
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-sm font-medium" title={item.file.name}>
            {item.file.name}
          </p>
          {item.status === "done" && item.result && (
            <span className="shrink-0 text-sm font-semibold tabular-nums">{item.result.score}/100</span>
          )}
        </div>

        {inPipeline && (
          <div className="flex items-center gap-3">
            <div aria-hidden className="flex w-32 shrink-0 gap-1">
              {STEPS.map((s, i) => (
                <span
                  key={s}
                  className={cn(
                    "h-1.5 flex-1 rounded-full bg-muted",
                    i < stepIndex && "bg-primary",
                    i === stepIndex && item.status === "running" && "bg-primary/50 motion-safe:animate-pulse",
                    i === stepIndex && item.status === "failed" && "bg-destructive",
                  )}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              {item.status === "queued"
                ? "Waiting"
                : `Step ${stepIndex + 1} of ${STEPS.length}: ${STEP_LABEL[item.step]}${item.status === "failed" ? " failed" : ""}`}
            </span>
          </div>
        )}

        {item.status === "done" && item.result && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {item.result.gateFailed && (
              <span className="inline-flex items-center gap-1 font-medium">
                <CircleX aria-hidden className="size-3.5 text-verdict-absent" />
                Must-have gate failed
              </span>
            )}
            {note && <span className="text-muted-foreground">{note}</span>}
            <Link
              href={`/dashboard/jobs/${jobId}/candidates/${item.candidateId}`}
              className="font-medium underline underline-offset-4"
            >
              View evidence
            </Link>
          </div>
        )}

        {item.status === "done" && warning && (
          <p className="flex items-start gap-1.5 text-xs">
            <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0 text-verdict-partial" />
            {warning}
          </p>
        )}

        {item.status === "failed" && (
          <div className="flex flex-wrap items-center gap-2">
            <p role="alert" className="text-xs text-destructive">
              {item.error}
            </p>
            {item.retryable && (
              <Button type="button" size="sm" variant="outline" onClick={onRetry} className="h-7 gap-1.5">
                <RotateCw aria-hidden className="size-3.5" />
                Retry {STEP_LABEL[item.step].toLowerCase()}
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
