import { CommunityBoardPage } from "@/components/community-board-page";
import { getDictionary, type Locale } from "@/lib/i18n";

export default function LocaleBoardPage({
  params,
}: {
  params: { locale: Locale };
}) {
  const dictionary = getDictionary(params.locale);

  return <CommunityBoardPage dictionary={dictionary} locale={params.locale} />;
}
