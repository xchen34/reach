"use client";

import { useEffect, useState } from "react";
import { getCurrentStaffSession } from "@/lib/api";
import { clearStaffAccessToken, readStoredStaffAccessToken } from "@/lib/staff-session";

export type StaffSessionStatus = "checking" | "authenticated" | "unauthenticated";

export function useStaffSessionStatus(refreshKey?: string | null) {
  const [status, setStatus] = useState<StaffSessionStatus>("checking");

  useEffect(() => {
    let isMounted = true;

    async function validateStoredSession() {
      const accessToken = readStoredStaffAccessToken();

      if (!accessToken) {
        setStatus("unauthenticated");
        return;
      }

      try {
        await getCurrentStaffSession(accessToken);
        if (isMounted) {
          setStatus("authenticated");
        }
      } catch {
        clearStaffAccessToken();
        if (isMounted) {
          setStatus("unauthenticated");
        }
      }
    }

    void validateStoredSession();

    function handleSessionChange() {
      void validateStoredSession();
    }

    window.addEventListener("storage", handleSessionChange);
    window.addEventListener("Reach.staff-session-changed", handleSessionChange);

    return () => {
      isMounted = false;
      window.removeEventListener("storage", handleSessionChange);
      window.removeEventListener("Reach.staff-session-changed", handleSessionChange);
    };
  }, [refreshKey]);

  return status;
}
