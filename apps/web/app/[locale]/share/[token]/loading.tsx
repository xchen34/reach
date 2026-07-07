"use client";

import { useParams } from "next/navigation";
import { getDictionary, isSupportedLocale, type Locale } from "@/lib/i18n";

export default function ShareTokenLoading() {
  const params = useParams<{ locale?: string }>();
  const rawLocale = params?.locale ?? "";
  const locale: Locale = isSupportedLocale(rawLocale) ? rawLocale : "en";
  const dictionary = getDictionary(locale);

  return (
    <main className="page-shell">
      <div className="page-card">
        <span className="eyebrow">{dictionary.share.eyebrow}</span>
        <h1 className="headline share-headline">{dictionary.share.title}</h1>
        <p className="lede">{dictionary.share.loading}</p>
      </div>
    </main>
  );
}
