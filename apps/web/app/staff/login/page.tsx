import { StaffLoginForm } from "@/components/staff-login-form";
import { getDictionary } from "@/lib/i18n";
import type { StaffAuthReason } from "@/lib/staff-session";

const allowedReasons = new Set<StaffAuthReason>([
  "expired",
  "invalid",
  "logged_out",
  "missing",
  "revoked",
]);

export default function StaffLoginAliasPage({
  searchParams,
}: {
  searchParams?: { reason?: string };
}) {
  const locale = "en";
  const dictionary = getDictionary(locale);
  const reason = searchParams?.reason;

  return (
    <StaffLoginForm
      dictionary={dictionary}
      locale={locale}
      reason={reason && allowedReasons.has(reason as StaffAuthReason) ? (reason as StaffAuthReason) : undefined}
    />
  );
}
