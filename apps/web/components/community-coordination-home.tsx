import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { StaffDashboardEntryLink } from "@/components/staff-dashboard-entry-link";
import type { PublicIncidentReportPageResponse } from "@/lib/api-types";
import type { Dictionary, Locale } from "@/lib/i18n";

const safeReportUrl = process.env.NEXT_PUBLIC_SAFE_REPORT_FORM_URL ?? "";
const missingReportUrl = process.env.NEXT_PUBLIC_MISSING_REPORT_FORM_URL ?? "";
const updateReportUrl = process.env.NEXT_PUBLIC_UPDATE_REPORT_FORM_URL ?? "";
type CommunityCoordinationHomeProps = {
  activeIncident: PublicIncidentReportPageResponse | null;
  dictionary: Dictionary;
  locale: Locale;
};

export function CommunityCoordinationHome({
  activeIncident,
  dictionary,
  locale,
}: CommunityCoordinationHomeProps) {
  const incidentReportHref = activeIncident ? `/${locale}/incidents/${activeIncident.slug}/report` : null;
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
    <AppShell
      homeLabel={dictionary.staff.login.backHome}
      languageLabel={dictionary.home.languagePicker}
      locale={locale}
      publicBoardLabel={dictionary.home.boardCta}
      sectionLabel={dictionary.home.eyebrow}
    >
      <div className="community-home-shell">
        <div className="community-home-hero">
          <h1 className="headline community-home-title">{dictionary.home.title}</h1>
          <p className="lede compact-lede">{dictionary.home.description}</p>
        </div>
        <p className="error-banner" role="alert">
          {dictionary.home.emergencyNotice}
        </p>

        <section className="community-entry-section" aria-labelledby="community-entry-title">
          <h2 className="section-title" id="community-entry-title">
            {dictionary.home.entryTitle}
          </h2>
          {activeIncident && incidentReportHref ? (
            <div className="community-action-list">
              <Link className="community-action-link" href={incidentReportHref}>
                <span>
                  <strong>{activeIncident.public_name}</strong>
                  <small>
                    {activeIncident.affected_area}
                    {activeIncident.public_description ? ` · ${activeIncident.public_description}` : ""}
                  </small>
                </span>
                <span aria-hidden="true">&rarr;</span>
              </Link>
            </div>
          ) : actions.every((action) => action.href) ? (
            <div className="community-action-list">
              {actions.map((action) => (
                <a
                  className="community-action-link"
                  href={action.href}
                  key={action.key}
                  rel="noreferrer"
                  target="_blank"
                >
                  <span>
                    <strong>{action.title}</strong>
                    <small>{action.description}</small>
                  </span>
                  <span aria-hidden="true">&rarr;</span>
                </a>
              ))}
            </div>
          ) : (
            <p className="info-banner">{dictionary.home.formUnavailable}</p>
          )}
        </section>

        <nav className="community-home-links" aria-label={dictionary.home.entryTitle}>
          <StaffDashboardEntryLink
            authenticatedLabel={dictionary.staff.returnToDashboard}
            locale={locale}
            loginLabel={dictionary.staff.loginCta}
          />
        </nav>
      </div>
    </AppShell>
  );
}
