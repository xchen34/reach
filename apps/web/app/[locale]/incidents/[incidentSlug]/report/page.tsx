import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ReportPhotoUpload } from "@/components/report-photo-upload";
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
  const googleFormUrl = withEnglishGoogleFormLocale(incident.google_form_url);

  return (
    <AppShell
      locale={params.locale}
      publicBoardLabel={dictionary.home.boardCta}
      sectionLabel="Incident report"
    >
      <section className="incident-report-page">
        <div className="incident-report-heading">
          <span className="eyebrow">Incident report</span>
          <h1 className="headline">{incident.public_name}</h1>
          <p className="lede">
            {incident.affected_area}
            {incident.public_description ? ` · ${incident.public_description}` : ""}
          </p>
        </div>

        <div className="alert-panel" role="note">
          <strong>REACH is not an emergency rescue service.</strong>
          <p>
            If someone is in immediate danger, contact official emergency services or on-site responders now.
            REACH reviews each report before deciding whether coordination is needed; submitting this form does
            not mean rescue will be dispatched.
          </p>
        </div>

        <ReportPhotoUpload dictionary={dictionary} incidentSlug={params.incidentSlug} />

        <div className="google-form-frame-shell">
          <iframe
            className="google-form-frame"
            src={googleFormUrl}
            title={`${incident.public_name} report form`}
          />
        </div>

        <p className="fallback-copy">
          If the form does not load,{" "}
          <a href={googleFormUrl} rel="noopener noreferrer" target="_blank">
            open the report form in a new tab
          </a>
          .
        </p>
      </section>
    </AppShell>
  );
}

function withEnglishGoogleFormLocale(url: string) {
  try {
    const parsedUrl = new URL(url);
    parsedUrl.searchParams.set("hl", "en");
    return parsedUrl.toString();
  } catch {
    return url;
  }
}
