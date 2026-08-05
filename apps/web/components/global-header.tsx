"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logoutStaffSession } from "@/lib/api";
import { getDictionary } from "@/lib/i18n";
import {
  buildStaffLoginHref,
  clearStaffAccessToken,
  readStoredStaffAccessToken,
} from "@/lib/staff-session";
import { useStaffSessionStatus } from "@/lib/use-staff-session-status";

const boardHref = "/board";
const contactsHref = "/contacts";
const staffHref = "/staff";
const staffLoginHref = "/staff/login";

/**
 * Rendered once by the root layout so it survives client-side navigation.
 *
 * It used to live inside AppShell, which every page rendered itself — so the
 * whole bar unmounted and remounted on each route change, repainting on every
 * click even though navigation is client-side.
 */
export function GlobalHeader() {
  const dictionary = getDictionary("en");
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const staffAuthState = useStaffSessionStatus(pathname);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const isBoardActive = pathname === boardHref;
  const isContactsActive = pathname === contactsHref || pathname.endsWith(contactsHref);
  const isStaffLoginRoute = pathname === staffLoginHref || pathname === "/staff/magic-link";
  const isStaffActive =
    pathname === staffHref ||
    pathname.startsWith(`${staffHref}/cases`) ||
    pathname.startsWith(`${staffHref}/reports`);

  const showStaffEntry = staffAuthState === "authenticated" || staffAuthState === "unauthenticated";
  const staffEntryHref = staffAuthState === "authenticated" ? staffHref : staffLoginHref;
  const staffEntryLabel =
    staffAuthState === "authenticated" ? "Control Center" : dictionary.staff.login.title;
  const isStaffEntryActive = staffAuthState === "authenticated" ? isStaffActive : isStaffLoginRoute;

  async function handleLogout() {
    const accessToken = readStoredStaffAccessToken();
    setIsLoggingOut(true);

    try {
      if (accessToken) {
        await logoutStaffSession(accessToken);
      }
    } catch {
      // Logging out must still clear the local capability if the API is unreachable.
    } finally {
      clearStaffAccessToken();
      setIsLoggingOut(false);
      window.dispatchEvent(new Event("Reach.staff-session-changed"));
      // The per-page logout buttons this replaces redirected to the login screen.
      router.replace(buildStaffLoginHref("logged_out"));
    }
  }

  return (
    <header className="global-header">
      <div className="global-header-inner">
        <div className="header-brand">REACH</div>
        <nav
          aria-label="Primary"
          className={`header-navigation ${
            staffAuthState === "authenticated" ? "header-navigation-authenticated" : ""
          }`}
        >
          <div className="header-nav-slot header-nav-board">
            <Link
              aria-current={isBoardActive ? "page" : undefined}
              className="button-secondary header-nav-button"
              data-active={isBoardActive}
              href={boardHref}
            >
              {dictionary.home.boardCta}
            </Link>
          </div>
          <div className="header-nav-slot header-nav-contacts">
            <Link
              aria-current={isContactsActive ? "page" : undefined}
              className="button-secondary header-nav-button"
              data-active={isContactsActive}
              href={contactsHref}
            >
              Contacts
            </Link>
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
        <div className="header-account">
          {staffAuthState === "authenticated" ? (
            <button
              className="button-secondary header-nav-button"
              disabled={isLoggingOut}
              type="button"
              onClick={() => void handleLogout()}
            >
              {isLoggingOut ? dictionary.staff.logoutSubmitting : dictionary.staff.logout}
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
