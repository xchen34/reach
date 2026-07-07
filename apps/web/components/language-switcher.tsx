import Link from "next/link";
import type { Locale } from "@/lib/i18n";

const localeOptions: Array<{ locale: Locale; label: string }> = [
  { locale: "en", label: "English" },
  { locale: "fr", label: "Francais" },
  { locale: "zh", label: "中文" },
];

export function LanguageSwitcher({
  currentLocale,
  label,
}: {
  currentLocale: Locale;
  label: string;
}) {
  return (
    <ul className="language-list" aria-label={label}>
      {localeOptions.map((option) => (
        <li key={option.locale}>
          <Link
            className="language-link"
            data-active={option.locale === currentLocale}
            href={`/${option.locale}`}
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
