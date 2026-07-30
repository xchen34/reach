"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, verifyStaffMagicLink } from "@/lib/api";
import type { Dictionary, Locale } from "@/lib/i18n";
import {
  buildStaffLoginHref,
  clearStaffAccessToken,
  getMagicLinkFailureReason,
  storeStaffAccessToken,
  type StaffMagicLinkFailureReason,
} from "@/lib/staff-session";
import { AppShell } from "@/components/app-shell";

type StaffMagicLinkVerifierProps = {
  dictionary: Dictionary;
  locale: Locale;
};

export function StaffMagicLinkVerifier({
  dictionary,
  locale: _locale,
}: StaffMagicLinkVerifierProps) {
  const hasConsumedMagicLink = useRef(false);
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [reason, setReason] = useState<StaffMagicLinkFailureReason | null>(null);

  useEffect(() => {
    if (hasConsumedMagicLink.current) {
      return;
    }

    hasConsumedMagicLink.current = true;

    let isMounted = true;
    const currentUrl = new URL(window.location.href);
    const token = currentUrl.searchParams.get("token");

    window.history.replaceState({}, "", `${currentUrl.pathname}${currentUrl.hash}`);

    if (!token) {
      clearStaffAccessToken();
      setStatus("error");
      setReason("missing");
      return () => {
        isMounted = false;
      };
    }

    void (async () => {
      try {
        const session = await verifyStaffMagicLink(token);
        const nextPath = "/staff";

        storeStaffAccessToken(session.access_token);
        window.dispatchEvent(new Event("Reach.staff-session-changed"));

        if (!isMounted) {
          window.location.replace(nextPath);
          return;
        }

        setStatus("success");
        window.setTimeout(() => {
          window.location.replace(nextPath);
        }, 600);
      } catch (error) {
        clearStaffAccessToken();

        if (!isMounted) {
          return;
        }

        if (error instanceof ApiError) {
          setReason(getMagicLinkFailureReason(error.detail));
        } else {
          setReason("unknown");
        }

        setStatus("error");
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <AppShell
      locale={_locale}
      publicBoardLabel={dictionary.home.boardCta}
      sectionLabel={dictionary.staff.eyebrow}
    >
      <h1 className="headline">{dictionary.staff.magicLink.title}</h1>
      <p className="lede">{dictionary.staff.magicLink.description}</p>

      {status === "verifying" ? (
        <section className="success-panel" aria-live="polite">
          <span className="status-pill">{dictionary.staff.magicLink.loadingBadge}</span>
          <p className="lede compact-lede">{dictionary.staff.magicLink.loading}</p>
        </section>
      ) : null}

      {status === "success" ? (
        <section className="success-panel" aria-live="polite">
          <span className="status-pill">{dictionary.staff.magicLink.successBadge}</span>
          <h2 className="section-title">{dictionary.staff.magicLink.successTitle}</h2>
          <p className="lede compact-lede">{dictionary.staff.magicLink.successBody}</p>
        </section>
      ) : null}

      {status === "error" && reason ? (
        <section className="success-panel" aria-live="polite">
          <span className="status-pill status-pill-warning">{dictionary.staff.magicLink.errorBadge}</span>
          <h2 className="section-title">{dictionary.staff.magicLink.errorTitle}</h2>
          <p className="lede compact-lede">{dictionary.staff.magicLink.errors[reason]}</p>
          <div className="button-row">
            <a className="button-primary" href={buildStaffLoginHref()}>
              {dictionary.staff.magicLink.backToLogin}
            </a>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
