import { CommunityCoordinationHome } from "@/components/community-coordination-home";
import { getDictionary, type Locale } from "@/lib/i18n";

export default function LocaleHomePage({
  params,
}: {
  params: { locale: Locale };
}) {
  const dictionary = getDictionary(params.locale);

  return <CommunityCoordinationHome dictionary={dictionary} locale={params.locale} />;
}
