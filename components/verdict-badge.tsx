import { CircleCheck, CircleHelp, CircleX, Contrast, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Verdict } from "@/types";

// Status colors from globals.css (--verdict-*). Color never carries meaning
// alone: every use pairs it with the icon and the label.
export const VERDICTS: Record<
  Verdict,
  { label: string; icon: LucideIcon; iconClass: string; fill: string; tint: string; mark: string }
> = {
  strong: { label: "Strong", icon: CircleCheck, iconClass: "text-verdict-strong", fill: "bg-verdict-strong", tint: "bg-verdict-strong/15", mark: "bg-verdict-strong/30" },
  partial: { label: "Partial", icon: Contrast, iconClass: "text-verdict-partial", fill: "bg-verdict-partial", tint: "bg-verdict-partial/15", mark: "bg-verdict-partial/30" },
  unproven: { label: "Unproven", icon: CircleHelp, iconClass: "text-verdict-unproven", fill: "bg-verdict-unproven", tint: "bg-verdict-unproven/15", mark: "bg-verdict-unproven/30" },
  absent: { label: "Absent", icon: CircleX, iconClass: "text-verdict-absent", fill: "bg-verdict-absent", tint: "bg-verdict-absent/15", mark: "bg-verdict-absent/30" },
};

export const VERDICT_ORDER: Verdict[] = ["strong", "partial", "unproven", "absent"];

export function VerdictBadge({ verdict, className }: { verdict: Verdict; className?: string }) {
  const { label, icon: Icon, iconClass, tint } = VERDICTS[verdict];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-foreground",
        tint,
        className,
      )}
    >
      <Icon aria-hidden className={cn("size-3.5", iconClass)} />
      {label}
    </span>
  );
}
