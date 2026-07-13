import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ApiError, getPublicIncidentReportPage } from "@/lib/api";
import { getDictionary, isSupportedLocale, type Locale } from "@/lib/i18n";

export default async function IncidentReportPage({
  params,
}: {
  params: { locale: Locale; incidentSlug: string };
}) {
  if (!isSupportedLocale(params.locale)) {
    notFound();
  }

  let incident;
  try {
    incident = await getPublicIncidentReportPage(params.incidentSlug);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const dictionary = getDictionary(params.locale);

  return (
    <AppShell
      homeLabel={dictionary.staff.login.backHome}
      languageLabel={dictionary.home.languagePicker}
      locale={params.locale}
      publicBoardLabel={dictionary.home.boardCta}
      sectionLabel="Incident intake"
      showPublicBoard={false}
    >
      <section className="incident-report-page">
        <div className="incident-report-heading">
          <span className="eyebrow">Incident intake</span>
          <h1 className="headline">{incident.public_name}</h1>
          <p className="lede">
            {incident.affected_area}
            {incident.public_description ? ` · ${incident.public_description}` : ""}
          </p>
        </div>

        <div className="alert-panel" role="note">
          <strong>REACH is not an emergency service.</strong>
          <p>
            If anyone is in immediate danger, contact official emergency services or on-site responders now.
            Every REACH submission is reviewed before any coordination action, and submitting this form does
            not guarantee dispatch or rescue.
          </p>
        </div>

        <div className="google-form-frame-shell">
          <iframe
            className="google-form-frame"
            src={incident.google_form_url}
            title={`${incident.public_name} report form`}
          />
        </div>

        <p className="fallback-copy">
          If the embedded form does not load,{" "}
          <a href={incident.google_form_url} rel="noopener noreferrer" target="_blank">
            open the report form in a new tab
          </a>
          .
        </p>
      </section>
    </AppShell>
  );
}
