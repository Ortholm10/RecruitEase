import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/profile";
import { LogoutButton } from "@/components/logout-button";

async function PortalContent() {
  const profile = await getCurrentProfile();

  if (!profile) redirect("/auth/login");
  if (profile.role === "recruiter") redirect("/dashboard");

  return (
    <>
      <h1 className="text-xl font-semibold">Welcome, {profile.fullName}</h1>
      <p className="text-sm text-muted-foreground">
        Your candidate portal is coming soon — this is where you&apos;ll see
        interview invites and feedback.
      </p>
      <LogoutButton />
    </>
  );
}

export default function PortalPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading...</p>
        }
      >
        <PortalContent />
      </Suspense>
    </div>
  );
}
