import { StaffLoginForm } from "@/components/staff-login-form";
import { getDictionary, type Locale } from "@/lib/i18n";
import type { StaffAuthReason } from "@/lib/staff-session";

const allowedReasons = new Set<StaffAuthReason>([
  "expired",
  "invalid",
  "logged_out",
  "missing",
  "revoked",
]);

export default function StaffLoginPage({
  params,
  searchParams,
}: {
  params: { locale: Locale };
  searchParams?: { reason?: string };
}) {
  const dictionary = getDictionary(params.locale);
  const reason = searchParams?.reason;

  return (
    <StaffLoginForm
      dictionary={dictionary}
      locale={params.locale}
      reason={reason && allowedReasons.has(reason as StaffAuthReason) ? (reason as StaffAuthReason) : undefined}
    />
  );
}
