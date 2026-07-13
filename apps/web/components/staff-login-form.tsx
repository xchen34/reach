"use client";

import { useState } from "react";
import { ApiError, requestStaffMagicLink } from "@/lib/api";
import type { Dictionary, Locale } from "@/lib/i18n";
import {
  buildStaffLoginHref,
  buildStaffMagicLinkHref,
  clearStaffAccessToken,
  type StaffAuthReason,
} from "@/lib/staff-session";
import { PageHeader } from "@/components/page-header";

type StaffLoginFormProps = {
  dictionary: Dictionary;
  locale: Locale;
  reason?: StaffAuthReason;
};

export function StaffLoginForm({ dictionary, locale, reason }: StaffLoginFormProps) {
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSuccess, setRequestSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reasonMessage = reason ? dictionary.staff.login.reasons[reason] : null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearStaffAccessToken();
    setRequestError(null);
    setEmailError(null);

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setEmailError(dictionary.staff.login.validation.emailRequired);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await requestStaffMagicLink(trimmedEmail);
      const magicLinkToken = getMagicLinkToken(response.login_url);

      if (magicLinkToken) {
        window.location.assign(buildStaffMagicLinkHref(locale, magicLinkToken));
        return;
      }

      setRequestSuccess(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === null) {
        setRequestError(dictionary.staff.login.errors.network);
      } else {
        setRequestError(dictionary.staff.login.errors.server);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="page-shell">
      <div className="page-card">
        <PageHeader
          homeLabel={dictionary.staff.login.backHome}
          languageLabel={dictionary.home.languagePicker}
          locale={locale}
          publicBoardLabel={dictionary.home.boardCta}
          sectionLabel={dictionary.staff.eyebrow}
        />
        <h1 className="headline">{dictionary.staff.login.title}</h1>
        <p className="lede">{dictionary.staff.login.description}</p>

        {reasonMessage ? (
          <p className="info-banner" role="status">
            {reasonMessage}
          </p>
        ) : null}

        {requestSuccess ? (
          <section className="success-panel" aria-live="polite">
            <span className="status-pill">{dictionary.staff.login.successBadge}</span>
            <h2 className="section-title">{dictionary.staff.login.successTitle}</h2>
            <p className="lede compact-lede">{dictionary.staff.login.successBody}</p>
            <p className="support-copy">{dictionary.staff.login.developmentNote}</p>
            <div className="button-row">
              <a className="button-secondary" href={buildStaffLoginHref(locale)}>
                {dictionary.staff.login.requestAnotherLink}
              </a>
            </div>
          </section>
        ) : (
          <form className="form-stack staff-auth-form" noValidate onSubmit={handleSubmit}>
            <label className="field">
              <span className="field-label">{dictionary.staff.login.emailLabel}</span>
              <input
                autoComplete="email"
                className="field-control"
                inputMode="email"
                name="email"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (emailError) {
                    setEmailError(null);
                  }
                }}
              />
              <span className="field-hint">{dictionary.staff.login.emailHint}</span>
              {emailError ? <span className="field-error">{emailError}</span> : null}
            </label>

            {requestError ? (
              <p className="error-banner" role="alert">
                {requestError}
              </p>
            ) : null}

            <div className="button-row">
              <button className="button-primary" disabled={isSubmitting} type="submit">
                {isSubmitting ? dictionary.staff.login.submitting : dictionary.staff.login.submit}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

function getMagicLinkToken(loginUrl: string | null | undefined) {
  if (!loginUrl || typeof window === "undefined") {
    return null;
  }

  try {
    const parsed = new URL(loginUrl, window.location.origin);
    return parsed.searchParams.get("token");
  } catch {
    return null;
  }
}
