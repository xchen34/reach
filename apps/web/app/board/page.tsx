import { CommunityBoardPage } from "@/components/community-board-page";
import { getDictionary } from "@/lib/i18n";

export default function BoardPage() {
  const locale = "en";
  const dictionary = getDictionary(locale);

  return <CommunityBoardPage dictionary={dictionary} locale={locale} />;
}
