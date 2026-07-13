import type { Dictionary, Locale } from "@/lib/i18n";
import type { ShareLinkCaseView } from "@/lib/api-types";
import { PageHeader } from "@/components/page-header";

export function ShareStatusCard({
  locale,
  dictionary,
  caseView,
}: {
  locale: Locale;
  dictionary: Dictionary;
  caseView: ShareLinkCaseView;
}) {
  const statusCopy = dictionary.caseStatus.labels[caseView.status];
  const createdAt = formatDateTime(caseView.created_at, locale);

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
        <h1 className="headline share-headline">{dictionary.share.title}</h1>
        <p className="lede">{dictionary.share.description}</p>

        <dl className="detail-grid">
          <div className="detail-card">
            <dt>{dictionary.share.caseCodeLabel}</dt>
            <dd>{caseView.case_code}</dd>
          </div>
          <div className="detail-card">
            <dt>{dictionary.share.statusLabel}</dt>
            <dd>
              <span className="status-pill">{statusCopy}</span>
            </dd>
          </div>
          <div className="detail-card detail-card-wide">
            <dt>{dictionary.share.locationLabel}</dt>
            <dd>{caseView.location_summary}</dd>
          </div>
          <div className="detail-card detail-card-wide">
            <dt>{dictionary.share.needsLabel}</dt>
            <dd>{caseView.needs_summary}</dd>
          </div>
          <div className="detail-card detail-card-wide">
            <dt>{dictionary.share.latestUpdateLabel}</dt>
            <dd>
              {caseView.latest_public_update ?? dictionary.share.latestUpdateFallback}
            </dd>
          </div>
          <div className="detail-card">
            <dt>{dictionary.share.createdAtLabel}</dt>
            <dd>{createdAt}</dd>
          </div>
        </dl>

        <p className="support-copy">{dictionary.share.footer}</p>
      </div>
    </main>
  );
}

function formatDateTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
