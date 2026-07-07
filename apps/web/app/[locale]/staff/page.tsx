import { StaffCaseListPage } from "@/components/staff-case-list-page";
import { getDictionary, type Locale } from "@/lib/i18n";

export default function StaffHomePage({
  params,
}: {
  params: { locale: Locale };
}) {
  const dictionary = getDictionary(params.locale);

  return <StaffCaseListPage dictionary={dictionary} locale={params.locale} />;
}
