import type { ComponentType } from "react";
import { Briefcase, Users } from "lucide-react";

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string | number;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-5" aria-hidden={true} />
      </div>
      <div>
        <p className="text-2xl leading-none font-semibold">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function StatsRow({ jobCount }: { jobCount: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <StatCard
        icon={Briefcase}
        label={jobCount === 1 ? "Job posted" : "Jobs posted"}
        value={jobCount}
      />
      <StatCard icon={Users} label="Candidates screened so far" value={0} />
    </div>
  );
}
