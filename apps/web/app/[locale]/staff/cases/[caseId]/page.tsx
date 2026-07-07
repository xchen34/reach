import { notFound } from "next/navigation";
import { StaffCaseDetailPage } from "@/components/staff-case-detail-page";
import { getDictionary, type Locale } from "@/lib/i18n";

export default function StaffCaseDetailRoute({
  params,
}: {
  params: { locale: Locale; caseId: string };
}) {
  const caseId = Number.parseInt(params.caseId, 10);

  if (!Number.isInteger(caseId) || caseId <= 0) {
    notFound();
  }

  const dictionary = getDictionary(params.locale);

  return (
    <StaffCaseDetailPage
      caseId={caseId}
      dictionary={dictionary}
      locale={params.locale}
    />
  );
}
