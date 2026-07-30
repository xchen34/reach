"use client";

import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import { useStaffSessionStatus } from "@/lib/use-staff-session-status";

type StaffDashboardEntryLinkProps = {
  authenticatedLabel: string;
  locale: Locale;
  loginLabel: string;
};

export function StaffDashboardEntryLink({
  authenticatedLabel,
  locale: _locale,
  loginLabel,
}: StaffDashboardEntryLinkProps) {
  const staffSessionStatus = useStaffSessionStatus("home-entry");

  if (staffSessionStatus === "checking") {
    return null;
  }

  const isAuthenticated = staffSessionStatus === "authenticated";

  return (
    <Link
      className="community-home-staff-link"
      href={isAuthenticated ? "/staff" : "/staff/login"}
    >
      {isAuthenticated ? authenticatedLabel : loginLabel}
    </Link>
  );
}
