import { Suspense } from "react";
import { listCandidateAnalyses, groupCandidatesByJob } from "@/lib/candidates";
import { OverviewDashboard } from "@/components/dashboard/overview-dashboard";

async function Overview() {
  const analyses = await listCandidateAnalyses();
  const grouped = groupCandidatesByJob(analyses);
  return <OverviewDashboard grouped={grouped} />;
}

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading overview...</p>
        }
      >
        <Overview />
      </Suspense>
    </div>
  );
}
