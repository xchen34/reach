"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getDictionary, isSupportedLocale } from "@/lib/i18n";

export default function ShareTokenError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ locale: string }>();
  const locale = isSupportedLocale(params.locale) ? params.locale : "en";
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
        <h1 className="headline share-headline">{dictionary.share.errorTitle}</h1>
        <p className="lede">{dictionary.share.errorBody}</p>
        <div className="button-row">
          <button className="button-primary" type="button" onClick={reset}>
            {dictionary.share.retry}
          </button>
        </div>
      </div>
    </main>
  );
}
