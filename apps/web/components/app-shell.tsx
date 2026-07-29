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
  languageLabel: string;
  publicBoardLabel: string;
  homeLabel: string;
  contentVariant?: "normal" | "wide";
  showLanguage?: boolean;
  showPublicBoard?: boolean;
  showHome?: boolean;
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
  languageLabel,
  publicBoardLabel,
  homeLabel,
  contentVariant = "normal",
  showLanguage = false,
  showPublicBoard = true,
  showHome = true,
  logoutAction,
  staffDashboardLabel = "工作后台",
  returnToStaffLabel = "返回后台",
  staffLoginLabel = "登录后台",
  logoutLabel = "退出登录",
  logoutSubmittingLabel = "正在退出...",
}: AppShellProps) {
  return (
    <div className="app-shell">
      <GlobalHeader
        homeLabel={homeLabel}
        languageLabel={languageLabel}
        locale={locale}
        logoutAction={logoutAction}
        logoutLabel={logoutLabel}
        logoutSubmittingLabel={logoutSubmittingLabel}
        publicBoardLabel={publicBoardLabel}
        returnToStaffLabel={returnToStaffLabel}
        sectionLabel={sectionLabel}
        showHome={showHome}
        showLanguage={showLanguage}
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
  homeLabel,
  showPublicBoard,
  showHome,
  logoutAction,
  staffDashboardLabel = "工作后台",
  returnToStaffLabel = "返回后台",
  staffLoginLabel = "登录后台",
  logoutLabel = "退出登录",
  logoutSubmittingLabel = "正在退出...",
}: GlobalHeaderProps) {
  const pathname = usePathname();
  const boardHref = `/${locale}/board`;
  const homeHref = `/${locale}`;
  const staffHref = `/${locale}/staff`;
  const staffLoginHref = `/${locale}/staff/login`;
  const isBoardActive = pathname === boardHref;
  const isHomeActive = pathname === homeHref;
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
    ) : staffAuthState === "unauthenticated" && !isStaffLoginRoute ? (
      <Link className="button-secondary header-nav-button" data-active="false" href={staffLoginHref}>
        {staffLoginLabel}
      </Link>
    ) : null);

  const staffNavigationLabel = isStaffActive ? staffDashboardLabel : returnToStaffLabel;

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
            {showHome ? (
              <Link
                aria-current={isHomeActive ? "page" : undefined}
                className="button-secondary header-nav-button"
                data-active={isHomeActive}
                href={homeHref}
              >
                {homeLabel}
              </Link>
            ) : null}
          </div>
          <div className="header-nav-slot header-nav-staff">
            {staffAuthState === "authenticated" ? (
              <Link
                aria-current={isStaffActive ? "page" : undefined}
                className="button-secondary header-nav-button"
                data-active={isStaffActive}
                href={staffHref}
              >
                {staffNavigationLabel}
              </Link>
            ) : null}
          </div>
        </nav>
        <div className="header-account">{accountAction}</div>
      </div>
    </header>
  );
}
