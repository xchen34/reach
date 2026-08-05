"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { isSupportedLocale, type Locale } from "@/lib/i18n";

export default function IncidentReportError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ locale?: string }>();
  const localeParam = params?.locale;
  const locale = localeParam && isSupportedLocale(localeParam) ? localeParam : ("en" as Locale);

  return (
    <AppShell locale={locale} publicBoardLabel="Public info" sectionLabel="Incident report">
      <section className="incident-report-page">
        <div className="incident-report-heading">
          <span className="eyebrow">Incident report</span>
          <h1 className="headline">The report page is temporarily unavailable.</h1>
          <p className="lede">
            The incident data could not be loaded right now. Please try again, or return to the public board.
          </p>
        </div>

        <div className="alert-panel" role="alert">
          <strong>Report loading failed.</strong>
          <p>
            This usually means the local API is unavailable or returned an unexpected error while loading the
            incident report form.
          </p>
        </div>

        <div className="button-row">
          <button className="button-primary" type="button" onClick={() => reset()}>
            Try again
          </button>
          <Link className="button-secondary" href="/board">
            Back to public board
          </Link>
        </div>
      </section>
    </AppShell>
  );
}
