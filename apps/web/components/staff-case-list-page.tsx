"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, getCurrentStaffSession, listStaffCases, logoutStaffSession } from "@/lib/api";
import type { StaffCaseListItem, CurrentStaffSession } from "@/lib/api-types";
import type { Dictionary, Locale } from "@/lib/i18n";
import {
  buildStaffLoginHref,
  clearStaffAccessToken,
  MissingStaffSessionError,
  UnauthorizedStaffSessionError,
  readStoredStaffAccessToken,
  type StaffAuthReason,
  withStaffAuthorization,
} from "@/lib/staff-session";
import { LanguageSwitcher } from "@/components/language-switcher";

type StaffCaseListPageProps = {
  dictionary: Dictionary;
  locale: Locale;
};

type PageState =
  | { status: "loading" }
  | { status: "ready"; accessToken: string; session: CurrentStaffSession; cases: StaffCaseListItem[] }
  | { status: "error"; message: string };

export function StaffCaseListPage({ dictionary, locale }: StaffCaseListPageProps) {
  const router = useRouter();
  const [state, setState] = useState<PageState>({ status: "loading" });
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      const accessToken = readStoredStaffAccessToken();

      try {
        const token = accessToken;
        if (!token) {
          throw new MissingStaffSessionError();
        }

        const session = await withStaffAuthorization(token, getCurrentStaffSession);
        const cases = await withStaffAuthorization(token, listStaffCases);

        if (!isMounted) {
          return;
        }

        setState({
          status: "ready",
          accessToken: token,
          session,
          cases,
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (error instanceof MissingStaffSessionError) {
          redirectToLogin(router, locale, "missing");
          return;
        }

        if (error instanceof UnauthorizedStaffSessionError) {
          redirectToLogin(router, locale, error.reason);
          return;
        }

        if (error instanceof ApiError && error.status === null) {
          setState({ status: "error", message: dictionary.staff.cases.errors.network });
          return;
        }

        setState({ status: "error", message: dictionary.staff.cases.errors.server });
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [dictionary.staff.cases.errors.network, dictionary.staff.cases.errors.server, locale, router]);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [locale],
  );

  async function handleLogout() {
    setIsLoggingOut(true);
    const accessToken = readStoredStaffAccessToken();

    try {
      await withStaffAuthorization(accessToken, logoutStaffSession);
    } catch (error) {
      if (!(error instanceof MissingStaffSessionError) && !(error instanceof UnauthorizedStaffSessionError)) {
        if (error instanceof ApiError && error.status === null) {
          setState({ status: "error", message: dictionary.staff.cases.errors.logoutNetwork });
          setIsLoggingOut(false);
          return;
        }
      }
    } finally {
      clearStaffAccessToken();
      router.replace(buildStaffLoginHref(locale, "logged_out"));
    }
  }

  if (state.status === "loading") {
    return (
      <main className="page-shell">
        <div className="page-card">
          <p className="lede">{dictionary.staff.session.loading}</p>
        </div>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="page-shell">
        <div className="page-card">
          <span className="eyebrow">{dictionary.staff.eyebrow}</span>
          <h1 className="headline">{dictionary.staff.cases.title}</h1>
          <p className="error-banner" role="alert">
            {state.message}
          </p>
          <div className="button-row">
            <button
              className="button-primary"
              type="button"
              onClick={() => window.location.reload()}
            >
              {dictionary.staff.cases.retry}
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <div className="page-card">
        <div className="staff-toolbar">
          <div>
            <span className="eyebrow">{dictionary.staff.eyebrow}</span>
            <h1 className="headline staff-headline">{dictionary.staff.cases.title}</h1>
            <p className="lede">{dictionary.staff.cases.description}</p>
          </div>
          <div className="staff-toolbar-actions">
            <LanguageSwitcher
              currentLocale={locale}
              label={dictionary.home.languagePicker}
            />
            <button
              className="button-secondary"
              disabled={isLoggingOut}
              type="button"
              onClick={handleLogout}
            >
              {isLoggingOut ? dictionary.staff.logoutSubmitting : dictionary.staff.logout}
            </button>
          </div>
        </div>

        <section className="detail-grid">
          <div className="detail-card">
            <dt>{dictionary.staff.cases.staffMemberLabel}</dt>
            <dd>{state.session.user.email}</dd>
          </div>
          <div className="detail-card">
            <dt>{dictionary.staff.cases.roleLabel}</dt>
            <dd>{dictionary.staff.roleLabels[state.session.user.role]}</dd>
          </div>
          <div className="detail-card">
            <dt>{dictionary.staff.cases.sessionExpiresLabel}</dt>
            <dd>{dateFormatter.format(new Date(state.session.session_expires_at))}</dd>
          </div>
        </section>

        <section className="staff-case-list" aria-labelledby="staff-case-list-title">
          <h2 className="section-title" id="staff-case-list-title">
            {dictionary.staff.cases.listTitle}
          </h2>

          {state.cases.length === 0 ? (
            <p className="support-copy">{dictionary.staff.cases.empty}</p>
          ) : (
            <div className="staff-case-stack">
              {state.cases.map((item) => (
                <article className="detail-card staff-case-card" key={item.id}>
                  <div className="staff-case-header">
                    <div>
                      <p className="status-pill status-pill-neutral">{item.case_code}</p>
                      <h3 className="section-title staff-case-title">{item.location_summary}</h3>
                    </div>
                    <Link
                      className="button-primary staff-link-button"
                      href={`/${locale}/staff/cases/${item.id}`}
                    >
                      {dictionary.staff.cases.openCase}
                    </Link>
                  </div>

                  <dl className="detail-grid">
                    <div className="detail-card">
                      <dt>{dictionary.staff.cases.statusLabel}</dt>
                      <dd>{dictionary.caseStatus.labels[item.status]}</dd>
                    </div>
                    <div className="detail-card">
                      <dt>{dictionary.staff.cases.urgencyLabel}</dt>
                      <dd>{dictionary.home.form.urgency.options[item.urgency]}</dd>
                    </div>
                    <div className="detail-card">
                      <dt>{dictionary.staff.cases.incidentTypeLabel}</dt>
                      <dd>{dictionary.home.form.incidentType.options[item.incident_type]}</dd>
                    </div>
                    <div className="detail-card">
                      <dt>{dictionary.staff.cases.assignedLabel}</dt>
                      <dd>{item.assigned_staff_user?.email ?? dictionary.staff.cases.unassigned}</dd>
                    </div>
                    <div className="detail-card detail-card-wide">
                      <dt>{dictionary.staff.cases.needsLabel}</dt>
                      <dd>{item.needs_summary}</dd>
                    </div>
                    <div className="detail-card detail-card-wide">
                      <dt>{dictionary.staff.cases.latestUpdateLabel}</dt>
                      <dd>{item.latest_public_update ?? dictionary.staff.cases.latestUpdateFallback}</dd>
                    </div>
                    <div className="detail-card">
                      <dt>{dictionary.staff.cases.createdAtLabel}</dt>
                      <dd>{dateFormatter.format(new Date(item.created_at))}</dd>
                    </div>
                    <div className="detail-card">
                      <dt>{dictionary.staff.cases.updatedAtLabel}</dt>
                      <dd>{dateFormatter.format(new Date(item.updated_at))}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function redirectToLogin(
  router: ReturnType<typeof useRouter>,
  locale: Locale,
  reason: StaffAuthReason,
) {
  router.replace(buildStaffLoginHref(locale, reason));
}
