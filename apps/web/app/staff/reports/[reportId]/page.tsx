import { notFound } from "next/navigation";
import { StaffReportDetailPage } from "@/components/staff-report-detail-page";
import { getDictionary } from "@/lib/i18n";

export default function StaffReportDetailPageRoute({
  params,
}: {
  params: { reportId: string };
}) {
  const reportId = Number.parseInt(params.reportId, 10);

  if (!Number.isInteger(reportId) || reportId <= 0) {
    notFound();
  }

  const locale = "en";
  const dictionary = getDictionary(locale);

  return <StaffReportDetailPage dictionary={dictionary} locale={locale} reportId={reportId} />;
}
