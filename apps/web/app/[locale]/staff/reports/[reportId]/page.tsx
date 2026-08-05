import { notFound } from "next/navigation";
import { StaffReportDetailPage } from "@/components/staff-report-detail-page";
import { getDictionary, type Locale } from "@/lib/i18n";

export default function StaffReportDetailRoute({
  params,
}: {
  params: { locale: Locale; reportId: string };
}) {
  const reportId = Number.parseInt(params.reportId, 10);

  if (!Number.isInteger(reportId) || reportId <= 0) {
    notFound();
  }

  const dictionary = getDictionary(params.locale);

  return <StaffReportDetailPage dictionary={dictionary} locale={params.locale} reportId={reportId} />;
}
