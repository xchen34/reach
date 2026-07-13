"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { Locale } from "@/lib/i18n";

type PageHeaderProps = {
  locale: Locale;
  sectionLabel: string;
  languageLabel: string;
  publicBoardLabel: string;
  homeLabel: string;
  showLanguage?: boolean;
  showPublicBoard?: boolean;
  showHome?: boolean;
  trailingAction?: ReactNode;
};

export function PageHeader({
  locale,
  sectionLabel,
  languageLabel,
  publicBoardLabel,
  homeLabel,
  showLanguage = true,
  showPublicBoard = true,
  showHome = true,
  trailingAction,
}: PageHeaderProps) {
  const pathname = usePathname();
  const boardHref = `/${locale}/board`;
  const homeHref = `/${locale}`;
  const isBoardActive = pathname === boardHref;
  const isHomeActive = pathname === homeHref;

  return (
    <header className="page-header">
      <div className="page-header-brand">{sectionLabel}</div>
      <nav className="page-header-controls" aria-label={sectionLabel}>
        {showLanguage ? (
          <LanguageSwitcher currentLocale={locale} label={languageLabel} />
        ) : null}
        {showPublicBoard ? (
          <Link
            aria-current={isBoardActive ? "page" : undefined}
            className="button-secondary page-header-link"
            data-active={isBoardActive}
            href={boardHref}
          >
            {publicBoardLabel}
          </Link>
        ) : null}
        {showHome ? (
          <Link
            aria-current={isHomeActive ? "page" : undefined}
            className="button-secondary page-header-link"
            data-active={isHomeActive}
            href={homeHref}
          >
            {homeLabel}
          </Link>
        ) : null}
        {trailingAction}
      </nav>
    </header>
  );
}
