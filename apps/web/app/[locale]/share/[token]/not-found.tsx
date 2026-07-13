"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getDictionary, isSupportedLocale, type Locale } from "@/lib/i18n";

export default function ShareTokenNotFound() {
  const params = useParams<{ locale?: string }>();
  const rawLocale = params?.locale ?? "";
  const locale: Locale = isSupportedLocale(rawLocale) ? rawLocale : "en";
  const dictionary = getDictionary(locale);

  return (
    <main className="page-shell">
      <div className="page-card">
        <PageHeader
          homeLabel={dictionary.staff.login.backHome}
          languageLabel={dictionary.home.languagePicker}
          locale={locale}
          publicBoardLabel={dictionary.home.boardCta}
          sectionLabel={dictionary.share.eyebrow}
        />
        <h1 className="headline share-headline">{dictionary.share.notFoundTitle}</h1>
        <p className="lede">{dictionary.share.notFoundBody}</p>
      </div>
    </main>
  );
}
