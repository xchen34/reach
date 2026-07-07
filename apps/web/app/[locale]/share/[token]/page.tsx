import { notFound } from "next/navigation";
import { ShareStatusCard } from "@/components/share-status-card";
import { ApiError, getSharedCase } from "@/lib/api";
import { getDictionary, type Locale } from "@/lib/i18n";

export default async function ShareTokenPage({
  params,
}: {
  params: { locale: Locale; token: string };
}) {
  const dictionary = getDictionary(params.locale);

  try {
    const caseView = await getSharedCase(params.token);

    return (
      <ShareStatusCard
        caseView={caseView}
        dictionary={dictionary}
        locale={params.locale}
      />
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }

    throw error;
  }
}
