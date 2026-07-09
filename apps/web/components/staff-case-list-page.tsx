"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, getCurrentStaffSession, listStaffCases, logoutStaffSession } from "@/lib/api";
import type { CurrentStaffSession, StaffCaseListItem } from "@/lib/api-types";
import type { Dictionary, Locale } from "@/lib/i18n";
import { buildStaffDashboardData } from "@/lib/staff-dashboard";
import { mockStaffDashboardCases, mockStaffDashboardSession } from "@/lib/staff-dashboard-mocks";
import {
  buildStaffLoginHref,
  clearStaffAccessToken,
  MissingStaffSessionError,
  readStoredStaffAccessToken,
  UnauthorizedStaffSessionError,
  withStaffAuthorization,
  type StaffAuthReason,
} from "@/lib/staff-session";
import { LanguageSwitcher } from "@/components/language-switcher";

type StaffCaseListPageProps = {
  dictionary: Dictionary;
  locale: Locale;
};

type PageState =
  | { status: "loading" }
  | {
      status: "ready";
      accessToken: string | null;
      mode: "live" | "mock";
      session: CurrentStaffSession;
      cases: StaffCaseListItem[];
    }
  | { status: "error"; message: string };

const mockDashboardEnabled = process.env.NEXT_PUBLIC_ENABLE_STAFF_DASHBOARD_MOCKS === "true";

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
          if (mockDashboardEnabled) {
            setState({
              status: "ready",
              accessToken: null,
              mode: "mock",
              session: mockStaffDashboardSession,
              cases: mockStaffDashboardCases,
            });
            return;
          }

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
          mode: "live",
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
          if (mockDashboardEnabled) {
            setState({
              status: "ready",
              accessToken: null,
              mode: "mock",
              session: mockStaffDashboardSession,
              cases: mockStaffDashboardCases,
            });
            return;
          }

          setState({ status: "error", message: dictionary.staff.cases.errors.network });
          return;
        }

        if (mockDashboardEnabled) {
          setState({
            status: "ready",
            accessToken: null,
            mode: "mock",
            session: mockStaffDashboardSession,
            cases: mockStaffDashboardCases,
          });
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
    if (state.status !== "ready") {
      return;
    }

    setIsLoggingOut(true);
    const accessToken = state.accessToken ?? readStoredStaffAccessToken();

    try {
      if (state.mode === "live") {
        await withStaffAuthorization(accessToken, logoutStaffSession);
      }
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

  const dashboard = buildStaffDashboardData(state.cases);

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

        <section className="staff-dashboard-source" aria-labelledby="staff-dashboard-source-title">
          <div>
            <h2 className="section-title" id="staff-dashboard-source-title">
              {dictionary.staff.cases.sourceTitle}
            </h2>
            <p className="support-copy">
              {state.mode === "mock"
                ? dictionary.staff.cases.mockSourceDescription
                : dictionary.staff.cases.sourceDescription}
            </p>
          </div>
          <p className="status-pill status-pill-neutral">
            {state.mode === "mock"
              ? dictionary.staff.cases.mockSourceBadge
              : dictionary.staff.cases.sourceBadge}
          </p>
        </section>

        <section className="staff-dashboard-summary" aria-labelledby="staff-dashboard-summary-title">
          <h2 className="section-title" id="staff-dashboard-summary-title">
            {dictionary.staff.cases.summaryTitle}
          </h2>
          <div className="detail-grid">
            <div className="detail-card">
              <dt>{dictionary.staff.cases.summaryCards.events}</dt>
              <dd>{dashboard.summary.totalEvents}</dd>
            </div>
            <div className="detail-card">
              <dt>{dictionary.staff.cases.summaryCards.openCases}</dt>
              <dd>{dashboard.summary.openCases}</dd>
            </div>
            <div className="detail-card">
              <dt>{dictionary.staff.cases.summaryCards.unassigned}</dt>
              <dd>{dashboard.summary.unassignedCases}</dd>
            </div>
            <div className="detail-card">
              <dt>{dictionary.staff.cases.summaryCards.critical}</dt>
              <dd>{dashboard.summary.criticalCases}</dd>
            </div>
          </div>
          <p className="support-copy">
            {dictionary.staff.cases.lastUpdatedLabel}{" "}
            {dashboard.summary.lastUpdatedAt
              ? dateFormatter.format(new Date(dashboard.summary.lastUpdatedAt))
              : dictionary.staff.cases.lastUpdatedFallback}
          </p>
        </section>

        <section className="staff-case-list" aria-labelledby="staff-event-list-title">
          <div className="staff-section-header">
            <div>
              <h2 className="section-title" id="staff-event-list-title">
                {dictionary.staff.cases.listTitle}
              </h2>
              <p className="support-copy">{dictionary.staff.cases.listDescription}</p>
            </div>
            <p className="status-pill status-pill-neutral">
              {dictionary.staff.cases.summaryCards.totalCases}: {dashboard.summary.totalCases}
            </p>
          </div>

          {dashboard.events.length === 0 ? (
            <p className="support-copy">{dictionary.staff.cases.empty}</p>
          ) : (
            <div className="staff-case-stack">
              {dashboard.events.map((event) => (
                <article className="detail-card staff-event-card" key={event.id}>
                  <div className="staff-case-header">
                    <div>
                      <p className="status-pill status-pill-neutral">
                        {dictionary.home.form.incidentType.options[event.incidentType]}
                      </p>
                      <h3 className="section-title staff-case-title">{event.title}</h3>
                      <p className="support-copy">{event.summary}</p>
                    </div>
                    <div className="staff-event-meta">
                      <div className="detail-card">
                        <dt>{dictionary.staff.cases.statusLabel}</dt>
                        <dd>{dictionary.caseStatus.labels[event.status]}</dd>
                      </div>
                      <div className="detail-card">
                        <dt>{dictionary.staff.cases.caseCountLabel}</dt>
                        <dd>{event.caseCount}</dd>
                      </div>
                      <div className="detail-card">
                        <dt>{dictionary.staff.cases.lastUpdatedLabel}</dt>
                        <dd>{dateFormatter.format(new Date(event.lastUpdatedAt))}</dd>
                      </div>
                    </div>
                  </div>

                  <dl className="detail-grid">
                    <div className="detail-card">
                      <dt>{dictionary.staff.cases.urgencyLabel}</dt>
                      <dd>{dictionary.home.form.urgency.options[event.highestUrgency]}</dd>
                    </div>
                    <div className="detail-card">
                      <dt>{dictionary.staff.cases.openCasesLabel}</dt>
                      <dd>{event.openCaseCount}</dd>
                    </div>
                    <div className="detail-card">
                      <dt>{dictionary.staff.cases.assignedLabel}</dt>
                      <dd>
                        {event.unassignedCaseCount === 0
                          ? dictionary.staff.cases.allAssigned
                          : `${event.unassignedCaseCount} ${dictionary.staff.cases.unassigned}`}
                      </dd>
                    </div>
                  </dl>

                  <div>
                    <h4 className="section-title">{dictionary.staff.cases.relatedCasesTitle}</h4>
                    <ol className="staff-related-case-list">
                      {event.relatedCases.map((item) => (
                        <li className="staff-related-case-row" key={item.id}>
                          <div>
                            <p className="status-pill status-pill-neutral">{item.case_code}</p>
                            <p className="staff-related-case-copy">
                              {dictionary.caseStatus.labels[item.status]} ·{" "}
                              {dictionary.home.form.urgency.options[item.urgency]}
                            </p>
                            <p className="support-copy">
                              {item.assigned_staff_user?.email ?? dictionary.staff.cases.unassigned}
                            </p>
                          </div>
                          <Link
                            className="button-primary staff-link-button"
                            href={`/${locale}/staff/cases/${item.id}`}
                          >
                            {dictionary.staff.cases.openCase}
                          </Link>
                        </li>
                      ))}
                    </ol>
                  </div>
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
