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

  return (
    <AppShell
      locale={params.locale}
      publicBoardLabel={dictionary.home.boardCta}
      sectionLabel="事件上报"
    >
      <section className="incident-report-page">
        <div className="incident-report-heading">
          <span className="eyebrow">事件上报</span>
          <h1 className="headline">{incident.public_name}</h1>
          <p className="lede">
            {incident.affected_area}
            {incident.public_description ? ` · ${incident.public_description}` : ""}
          </p>
        </div>

        <div className="alert-panel" role="note">
          <strong>REACH 不是紧急救援服务。</strong>
          <p>
            如果有人正处于立即危险中，请立刻联系官方紧急服务或现场救援人员。REACH 会先查看每一份上报，
            再决定是否需要协调行动；提交表单不代表一定会派出救援。
          </p>
        </div>

        <ReportPhotoUpload dictionary={dictionary} incidentSlug={params.incidentSlug} />

        <div className="google-form-frame-shell">
          <iframe
            className="google-form-frame"
            src={incident.google_form_url}
            title={`${incident.public_name} 上报表单`}
          />
        </div>

        <p className="fallback-copy">
          如果表单没有载入，请{" "}
          <a href={incident.google_form_url} rel="noopener noreferrer" target="_blank">
            在新分页打开上报表单
          </a>
          。
        </p>
      </section>
    </AppShell>
  );
}
