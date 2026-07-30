import { CommunityCoordinationHome } from "@/components/community-coordination-home";
import { ApiError, getCurrentPublicIncidentReportPage } from "@/lib/api";
import type { PublicIncidentReportPageResponse } from "@/lib/api-types";
import { getDictionary } from "@/lib/i18n";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const locale = "en";
  const dictionary = getDictionary(locale);
  let activeIncident: PublicIncidentReportPageResponse | null = null;

  try {
    activeIncident = await getCurrentPublicIncidentReportPage();
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) {
      activeIncident = null;
    }
  }

  if (activeIncident) {
    redirect(`/incidents/${activeIncident.slug}/report`);
  }

  return <CommunityCoordinationHome activeIncident={activeIncident} dictionary={dictionary} locale={locale} />;
}
