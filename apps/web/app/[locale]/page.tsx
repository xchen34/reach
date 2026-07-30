import { CommunityCoordinationHome } from "@/components/community-coordination-home";
import { ApiError, getCurrentPublicIncidentReportPage } from "@/lib/api";
import type { PublicIncidentReportPageResponse } from "@/lib/api-types";
import { getDictionary, type Locale } from "@/lib/i18n";
import { redirect } from "next/navigation";

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

  if (activeIncident) {
    redirect(`/${params.locale}/incidents/${activeIncident.slug}/report`);
  }

  return (
    <CommunityCoordinationHome
      activeIncident={activeIncident}
      dictionary={dictionary}
      locale={params.locale}
    />
  );
}
