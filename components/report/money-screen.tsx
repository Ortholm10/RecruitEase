import { Frown, TrendingDown, TrendingUp, Forward } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { VerdictBadge } from "@/components/verdict-badge";
import { cn } from "@/lib/utils";
import type {
  Movement,
  RequirementEvaluationRow,
  RequirementScore,
  Score,
  Verdict,
} from "@/types";

/**
 * B8 — the money screen. Side-by-side evidence per requirement:
 *   resume evidence   |   interview evidence   (with movement + remaining gap)
 *
 * Pure render — no LLM, no hire/no-hire. It assembles evidence against every
 * requirement and (in the collapsed integrity timeline) surfaces objective
 * integrity signals reusing the describeEvent language. It never computes a
 * single hire/no-hire score.
 */

export function MovementBadge({
  movement,
  label,
}: {
  movement: Movement;
  label: string | null;
}) {
  if (movement === null || label === null) return null;
  const Icon =
    movement === "up" ? TrendingUp : movement === "down" ? TrendingDown : Forward;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        movement === "up"
          ? "border-verdict-strong bg-verdict-strong/10 text-verdict-strong"
          : movement === "down"
            ? "border-verdict-partial bg-verdict-partial/10 text-verdict-partial"
            : "border-border bg-muted text-muted-foreground",
      )}
    >
      <Icon aria-hidden className="size-3" />
      {label}
    </span>
  );
}

export function RequirementEvaluationRowItem({
  skill,
  resume,
  interview,
  movement,
  movementLabel,
  remainingGap,
  gapReason,
}: {
  skill: string;
  resume: RequirementScore;
  interview: Verdict | null;
  movement: Movement;
  movementLabel: string | null;
  remainingGap: boolean;
  gapReason: string | null;
}) {
  return (
    <li className="grid gap-2 border-b py-3 last:border-0 sm:grid-cols-[1.2fr_1fr]">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-sm">{skill}</span>
          <VerdictBadge verdict={resume.verdict} />
        </div>
        {resume.evidence?.quote ? (
          <p className="text-xs text-muted-foreground">“{resume.evidence.quote}”</p>
        ) : (
          <p className="text-xs text-muted-foreground">No resume evidence located</p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">After interview</span>
          <VerdictBadge verdict={interview ?? "absent"} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {movement !== null && movementLabel ? (
            <MovementBadge movement={movement} label={movementLabel} />
          ) : (
            <span className="text-xs text-muted-foreground">No interview evidence</span>
          )}
          {remainingGap && (
            <span className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground">
              <Frown aria-hidden className="size-3" />
              Remaining gap
            </span>
          )}
        </div>
        {remainingGap && gapReason ? (
          <p className="text-xs text-muted-foreground">{gapReason}</p>
        ) : null}
      </div>
    </li>
  );
}

export function MoneyScreen({
  requirements,
  score,
  rows,
  gaps,
}: {
  requirements: { id: string; skill: string }[];
  score: { breakdown: RequirementScore[] } | null;
  rows: RequirementEvaluationRow[];
  gaps: RequirementEvaluationRow[];
}) {
  const byRequirement = new Map(
    rows.map((r) => [r.requirementId, r] as const),
  );
  const byId = new Map(requirements.map((r) => [r.id, r] as const));

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="px-0 pt-0">
        <CardTitle className="text-lg">Requirement evaluation</CardTitle>
        <CardDescription>
          Resume evidence vs interview evidence, side by side. Movement shows
          what the interview added (or didn&apos;t). Gaps below are what
          still needs resolving before a decision.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <ul className="flex flex-col">
          {requirements.map((req) => {
            const row = byRequirement.get(req.id);
            const resume = score?.breakdown.find(
              (b) => b.requirementId === req.id,
            );
            return (
              <RequirementEvaluationRowItem
                key={req.id}
                skill={req.skill}
                resume={
                  resume ?? {
                    requirementId: req.id,
                    verdict: "absent",
                    points: 0,
                    evidence: null,
                    reasoning: "",
                  }
                }
                interview={row?.interview.verdict ?? null}
                movement={row?.movement ?? null}
                movementLabel={row?.movementLabel ?? null}
                remainingGap={row?.remainingGap ?? false}
                gapReason={row?.gapReason ?? null}
              />
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
