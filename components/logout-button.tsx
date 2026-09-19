"use client";

import { useLogout } from "@/hooks/use-logout";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const { logout, isLoading, error } = useLogout();

  return (
    <div className="flex flex-col items-end gap-1">
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
      <Button onClick={logout} disabled={isLoading}>
        {isLoading ? "Logging out..." : "Logout"}
      </Button>
    </div>
  );
}
