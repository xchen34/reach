import { StaffMagicLinkVerifier } from "@/components/staff-magic-link-verifier";
import { getDictionary } from "@/lib/i18n";

export default function StaffMagicLinkPage() {
  const locale = "en";
  const dictionary = getDictionary(locale);

  return <StaffMagicLinkVerifier dictionary={dictionary} locale={locale} />;
}
