import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/profile";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { UserMenu } from "@/components/dashboard/user-menu";

async function DashboardChrome({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/auth/login");
  }
  if (profile.role !== "recruiter") {
    redirect("/portal");
  }

  return (
    <div className="dark recruiter-theme min-h-screen bg-background text-foreground">
      <header className="flex h-16 items-center justify-between border-b px-6">
        <Link href="/dashboard" className="font-semibold">
          RecruitEase
        </Link>
        <UserMenu fullName={profile.fullName} email={profile.email} />
      </header>
      <div className="flex">
        <aside className="hidden w-56 shrink-0 border-r p-4 md:block">
          <SidebarNav />
        </aside>
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
          Loading...
        </div>
      }
    >
      <DashboardChrome>{children}</DashboardChrome>
    </Suspense>
  );
}
