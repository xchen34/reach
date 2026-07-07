import { StaffCaseListPage } from "@/components/staff-case-list-page";
import { getDictionary } from "@/lib/i18n";

export default function StaffHomeAliasPage() {
  const locale = "en";
  const dictionary = getDictionary(locale);

  return <StaffCaseListPage dictionary={dictionary} locale={locale} />;
}
