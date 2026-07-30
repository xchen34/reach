"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutStaffSession } from "@/lib/api";
import type { Locale } from "@/lib/i18n";
import { clearStaffAccessToken, readStoredStaffAccessToken } from "@/lib/staff-session";
import { useStaffSessionStatus } from "@/lib/use-staff-session-status";

type AppShellProps = {
  children: ReactNode;
  locale: Locale;
  sectionLabel: string;
  publicBoardLabel: string;
  contentVariant?: "normal" | "wide";
  showPublicBoard?: boolean;
  logoutAction?: ReactNode;
  staffDashboardLabel?: string;
  returnToStaffLabel?: string;
  staffLoginLabel?: string;
  logoutLabel?: string;
  logoutSubmittingLabel?: string;
};

export function AppShell({
  children,
  locale,
  sectionLabel,
  publicBoardLabel,
  contentVariant = "normal",
  showPublicBoard = true,
  logoutAction,
  staffDashboardLabel = "Staff dashboard",
  returnToStaffLabel = "Return to staff",
  staffLoginLabel = "Staff login",
  logoutLabel = "Log out",
  logoutSubmittingLabel = "Logging out...",
}: AppShellProps) {
  return (
    <div className="app-shell">
      <GlobalHeader
        locale={locale}
        logoutAction={logoutAction}
        logoutLabel={logoutLabel}
        logoutSubmittingLabel={logoutSubmittingLabel}
        publicBoardLabel={publicBoardLabel}
        returnToStaffLabel={returnToStaffLabel}
        sectionLabel={sectionLabel}
        showPublicBoard={showPublicBoard}
        staffDashboardLabel={staffDashboardLabel}
        staffLoginLabel={staffLoginLabel}
      />
      <main className="app-main">
        <div className={`app-content app-content-${contentVariant}`}>{children}</div>
      </main>
    </div>
  );
}

type GlobalHeaderProps = Omit<AppShellProps, "children" | "contentVariant">;

function GlobalHeader({
  locale,
  sectionLabel,
  publicBoardLabel,
  showPublicBoard,
  logoutAction,
  staffDashboardLabel = "Staff dashboard",
  returnToStaffLabel = "Return to staff",
  staffLoginLabel = "Staff login",
  logoutLabel = "Log out",
  logoutSubmittingLabel = "Logging out...",
}: GlobalHeaderProps) {
  const pathname = usePathname();
  const boardHref = `/${locale}/board`;
  const staffHref = `/${locale}/staff`;
  const staffLoginHref = `/${locale}/staff/login`;
  const isBoardActive = pathname === boardHref;
  const isStaffActive = pathname === staffHref || pathname.startsWith(`${staffHref}/cases/`);
  const isStaffLoginRoute = pathname === staffLoginHref || pathname === `/${locale}/staff/magic-link`;
  const staffAuthState = useStaffSessionStatus(pathname);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    const accessToken = readStoredStaffAccessToken();
    setIsLoggingOut(true);

    try {
      if (accessToken) {
        await logoutStaffSession(accessToken);
      }
    } catch {
      // Logout should still clear the local capability if the API is unreachable.
    } finally {
      clearStaffAccessToken();
      setIsLoggingOut(false);
      window.dispatchEvent(new Event("Reach.staff-session-changed"));
    }
  }

  const accountAction =
    logoutAction ??
    (staffAuthState === "authenticated" ? (
      <button
        className="button-secondary header-nav-button"
        disabled={isLoggingOut}
        type="button"
        onClick={() => void handleLogout()}
      >
        {isLoggingOut ? logoutSubmittingLabel : logoutLabel}
      </button>
    ) : null);

  const staffNavigationLabel = isStaffActive ? staffDashboardLabel : returnToStaffLabel;
  const showStaffEntry = staffAuthState === "authenticated" || staffAuthState === "unauthenticated";
  const staffEntryHref = staffAuthState === "authenticated" ? staffHref : staffLoginHref;
  const staffEntryLabel = staffAuthState === "authenticated" ? staffNavigationLabel : staffLoginLabel;
  const isStaffEntryActive = staffAuthState === "authenticated" ? isStaffActive : isStaffLoginRoute;

  return (
    <header className="global-header">
      <div className="global-header-inner">
        <div className="header-brand">REACH</div>
        <nav
          className={`header-navigation ${
            staffAuthState === "authenticated" ? "header-navigation-authenticated" : ""
          }`}
          aria-label={sectionLabel}
        >
          <div className="header-nav-slot header-nav-board">
            {showPublicBoard ? (
              <Link
                aria-current={isBoardActive ? "page" : undefined}
                className="button-secondary header-nav-button"
                data-active={isBoardActive}
                href={boardHref}
              >
                {publicBoardLabel}
              </Link>
            ) : null}
          </div>
          <div className="header-nav-slot header-nav-home">
            {showStaffEntry ? (
              <Link
                aria-current={isStaffEntryActive ? "page" : undefined}
                className="button-secondary header-nav-button"
                data-active={isStaffEntryActive}
                href={staffEntryHref}
              >
                {staffEntryLabel}
              </Link>
            ) : null}
          </div>
        </nav>
        <div className="header-account">{accountAction}</div>
      </div>
    </header>
  );
}
