import { StaffMagicLinkVerifier } from "@/components/staff-magic-link-verifier";
import { getDictionary, type Locale } from "@/lib/i18n";

export default function StaffMagicLinkPage({
  params,
}: {
  params: { locale: Locale };
}) {
  const dictionary = getDictionary(params.locale);

  return <StaffMagicLinkVerifier dictionary={dictionary} locale={params.locale} />;
}
