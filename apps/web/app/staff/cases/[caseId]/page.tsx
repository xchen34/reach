import { notFound } from "next/navigation";
import { StaffCaseDetailPage } from "@/components/staff-case-detail-page";
import { getDictionary } from "@/lib/i18n";

export default function StaffCaseDetailPageRoute({
  params,
}: {
  params: { caseId: string };
}) {
  const caseId = Number.parseInt(params.caseId, 10);

  if (!Number.isInteger(caseId) || caseId <= 0) {
    notFound();
  }

  const locale = "en";
  const dictionary = getDictionary(locale);

  return (
    <StaffCaseDetailPage
      caseId={caseId}
      dictionary={dictionary}
      locale={locale}
    />
  );
}
