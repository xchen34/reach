"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n";

const localeOptions: Array<{ locale: Locale; label: string }> = [
  { locale: "en", label: "English" },
  { locale: "fr", label: "Français" },
  { locale: "zh", label: "中文" },
];

export function LanguageSwitcher({
  currentLocale,
  label,
}: {
  currentLocale: Locale;
  label: string;
}) {
  const pathname = usePathname();

  return (
    <ul className="language-list" aria-label={label}>
      {localeOptions.map((option) => (
        <li key={option.locale}>
          <Link
            className="language-link"
            data-active={option.locale === currentLocale}
            href={buildLocaleHref(pathname, option.locale)}
            hrefLang={option.locale}
            locale={false}
          >
            {option.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function buildLocaleHref(
  pathname: string | null,
  nextLocale: Locale,
) {
  const currentPath = pathname && pathname.length > 0 ? pathname : "/";
  const parts = currentPath.split("/").filter(Boolean);

  if (parts.length > 0 && isLocaleSegment(parts[0])) {
    parts[0] = nextLocale;
  } else {
    parts.unshift(nextLocale);
  }

  const nextPath = `/${parts.join("/")}`;
  return nextPath;
}

function isLocaleSegment(value: string): value is Locale {
  return value === "en" || value === "fr" || value === "zh";
}
