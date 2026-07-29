import { redirect } from "next/navigation";

export default function IncidentReportRedirectPage({
  params,
}: {
  params: { incidentSlug: string };
}) {
  redirect(`/zh/incidents/${params.incidentSlug}/report`);
}
