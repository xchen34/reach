"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { Locale } from "@/lib/i18n";

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
};

export function AppShell({
  children,
  locale,
  sectionLabel,
  languageLabel,
  publicBoardLabel,
  homeLabel,
  contentVariant = "normal",
  showLanguage = true,
  showPublicBoard = true,
  showHome = true,
  logoutAction,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <GlobalHeader
        homeLabel={homeLabel}
        languageLabel={languageLabel}
        locale={locale}
        logoutAction={logoutAction}
        publicBoardLabel={publicBoardLabel}
        sectionLabel={sectionLabel}
        showHome={showHome}
        showLanguage={showLanguage}
        showPublicBoard={showPublicBoard}
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
  languageLabel,
  publicBoardLabel,
  homeLabel,
  showLanguage,
  showPublicBoard,
  showHome,
  logoutAction,
}: GlobalHeaderProps) {
  const pathname = usePathname();
  const boardHref = `/${locale}/board`;
  const homeHref = `/${locale}`;
  const isBoardActive = pathname === boardHref;
  const isHomeActive = pathname === homeHref;

  return (
    <header className="global-header">
      <div className="global-header-inner">
        <div className="header-brand">REACH</div>
        <nav className="header-navigation" aria-label={sectionLabel}>
          <div className="header-nav-slot header-nav-language">
            {showLanguage ? <LanguageSwitcher currentLocale={locale} label={languageLabel} /> : null}
          </div>
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
          <div className="header-nav-slot header-nav-logout">{logoutAction}</div>
        </nav>
      </div>
    </header>
  );
}
