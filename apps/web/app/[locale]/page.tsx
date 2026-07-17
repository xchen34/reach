import { CommunityCoordinationHome } from "@/components/community-coordination-home";
import { ApiError, getCurrentPublicIncidentReportPage } from "@/lib/api";
import type { PublicIncidentReportPageResponse } from "@/lib/api-types";
import { getDictionary, type Locale } from "@/lib/i18n";

export default async function LocaleHomePage({
  params,
}: {
  params: { locale: Locale };
}) {
  const dictionary = getDictionary(params.locale);
  let activeIncident: PublicIncidentReportPageResponse | null = null;

  try {
    activeIncident = await getCurrentPublicIncidentReportPage();
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) {
      activeIncident = null;
    }
  }

  return (
    <CommunityCoordinationHome
      activeIncident={activeIncident}
      dictionary={dictionary}
      locale={params.locale}
    />
  );
}
