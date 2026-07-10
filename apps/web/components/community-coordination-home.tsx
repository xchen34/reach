import Link from "next/link";
import { LanguageSwitcher } from "@/components/language-switcher";
import type { Dictionary, Locale } from "@/lib/i18n";

const safeReportUrl = process.env.NEXT_PUBLIC_SAFE_REPORT_FORM_URL ?? "";
const missingReportUrl = process.env.NEXT_PUBLIC_MISSING_REPORT_FORM_URL ?? "";
const updateReportUrl = process.env.NEXT_PUBLIC_UPDATE_REPORT_FORM_URL ?? "";
const publicBoardUrl = process.env.NEXT_PUBLIC_COMMUNITY_BOARD_URL ?? "";

type CommunityCoordinationHomeProps = {
  dictionary: Dictionary;
  locale: Locale;
};

export function CommunityCoordinationHome({
  dictionary,
  locale,
}: CommunityCoordinationHomeProps) {
  const actions = [
    {
      key: "safe" as const,
      title: dictionary.home.actions.safe.title,
      description: dictionary.home.actions.safe.description,
      href: safeReportUrl,
      label: dictionary.home.actions.safe.cta,
    },
    {
      key: "missing" as const,
      title: dictionary.home.actions.missing.title,
      description: dictionary.home.actions.missing.description,
      href: missingReportUrl,
      label: dictionary.home.actions.missing.cta,
    },
    {
      key: "update" as const,
      title: dictionary.home.actions.update.title,
      description: dictionary.home.actions.update.description,
      href: updateReportUrl,
      label: dictionary.home.actions.update.cta,
    },
  ];

  return (
    <main className="page-shell">
      <div className="page-card page-card-wide community-home-shell">
        <div className="community-home-header">
          <div>
            <span className="eyebrow">{dictionary.home.eyebrow}</span>
            <h1 className="headline headline-compact">{dictionary.home.title}</h1>
            <p className="lede">{dictionary.home.description}</p>
          </div>
          <div className="community-home-toolbar">
            <LanguageSwitcher currentLocale={locale} label={dictionary.home.languagePicker} />
            <Link className="button-secondary" href={`/${locale}/staff/login`}>
              {dictionary.home.staffCta}
            </Link>
          </div>
        </div>
        <p className="error-banner" role="alert">
          {dictionary.home.emergencyNotice}
        </p>
        <div className="community-home-intro">
          <p className="support-copy compact-lede">{dictionary.home.privacy}</p>
          <div className="detail-card community-process-card">
            <p className="community-process-label">{dictionary.home.workflowTitle}</p>
            <ol className="community-process-list">
              {dictionary.home.workflowSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </div>

        <section className="community-entry-section" aria-labelledby="community-entry-title">
          <div className="community-entry-header">
            <div>
              <h2 className="section-title" id="community-entry-title">
                {dictionary.home.entryTitle}
              </h2>
              <p className="support-copy">{dictionary.home.entryDescription}</p>
            </div>
            <Link className="button-primary" href={`/${locale}/board`}>
              {dictionary.home.boardCta}
            </Link>
          </div>

          <div className="section-grid">
            {actions.map((action) => (
              <article className="detail-card community-action-card" key={action.key}>
                <div className="community-action-body">
                  <h3 className="section-title community-action-title">{action.title}</h3>
                  <p className="support-copy community-action-copy">{action.description}</p>
                </div>
                {action.href ? (
                  <a
                    className="button-primary"
                    href={action.href}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {action.label}
                  </a>
                ) : (
                  <p className="field-hint">{dictionary.home.formPending}</p>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="community-entry-section" aria-labelledby="community-guidelines-title">
          <h2 className="section-title" id="community-guidelines-title">
            {dictionary.home.guidelinesTitle}
          </h2>
          <ul className="community-guidelines-list">
            {dictionary.home.guidelines.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
