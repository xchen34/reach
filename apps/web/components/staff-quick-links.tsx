"use client";

import Link from "next/link";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { Locale } from "@/lib/i18n";

type StaffQuickLinksProps = {
  currentLocale: Locale;
  languageLabel: string;
  publicBoardLabel: string;
};

export function StaffQuickLinks({
  currentLocale,
  languageLabel,
  publicBoardLabel,
}: StaffQuickLinksProps) {
  return (
    <div className="staff-quick-links">
      <LanguageSwitcher currentLocale={currentLocale} label={languageLabel} />
      <Link className="button-secondary staff-public-board-link" href={`/${currentLocale}/board`}>
        {publicBoardLabel}
      </Link>
    </div>
  );
}
