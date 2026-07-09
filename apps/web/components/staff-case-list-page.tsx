"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, getCurrentStaffSession, getStaffPublishQueue, logoutStaffSession } from "@/lib/api";
import type { CurrentStaffSession, StaffQueueResponse } from "@/lib/api-types";
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
      dashboard: StaffQueueResponse;
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
              dashboard: toQueueResponse(buildStaffDashboardData(mockStaffDashboardCases)),
            });
            return;
          }

          throw new MissingStaffSessionError();
        }

        const session = await withStaffAuthorization(token, getCurrentStaffSession);
        const dashboard = await withStaffAuthorization(token, getStaffPublishQueue);

        if (!isMounted) {
          return;
        }

        setState({
          status: "ready",
          accessToken: token,
          mode: "live",
          session,
          dashboard,
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
              dashboard: toQueueResponse(buildStaffDashboardData(mockStaffDashboardCases)),
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
            dashboard: toQueueResponse(buildStaffDashboardData(mockStaffDashboardCases)),
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

  const dashboard = state.dashboard;

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
              <dt>{dictionary.staff.cases.summaryCards.awaitingVerification}</dt>
              <dd>{dashboard.summary.awaiting_verification_groups}</dd>
            </div>
            <div className="detail-card">
              <dt>{dictionary.staff.cases.summaryCards.readyToPublish}</dt>
              <dd>{dashboard.summary.ready_to_publish_groups}</dd>
            </div>
            <div className="detail-card">
              <dt>{dictionary.staff.cases.summaryCards.published}</dt>
              <dd>{dashboard.summary.published_groups}</dd>
            </div>
            <div className="detail-card">
              <dt>{dictionary.staff.cases.summaryCards.totalCases}</dt>
              <dd>{dashboard.summary.total_cases}</dd>
            </div>
          </div>
          <p className="support-copy">
            {dictionary.staff.cases.lastUpdatedLabel}{" "}
            {dashboard.summary.last_updated_at
              ? dateFormatter.format(new Date(dashboard.summary.last_updated_at))
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
              {dictionary.staff.cases.summaryCards.openCases}: {dashboard.summary.open_cases}
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
                        {dictionary.home.form.incidentType.options[event.incident_type]}
                      </p>
                      <h3 className="section-title staff-case-title">{event.title}</h3>
                      {event.subject_name ? (
                        <p className="field-hint">
                          {dictionary.staff.cases.subjectLabel}: {event.subject_name}
                        </p>
                      ) : null}
                      {event.source_relationship ? (
                        <p className="field-hint">
                          {dictionary.staff.cases.sourceRelationshipLabel}: {event.source_relationship}
                        </p>
                      ) : null}
                      <p className="support-copy">{event.summary}</p>
                    </div>
                    <div className="staff-event-meta">
                      <div className="detail-card">
                        <dt>{dictionary.staff.cases.publishStateLabel}</dt>
                        <dd>{getPublishStateLabel(dictionary, event.publish_state)}</dd>
                      </div>
                      <div className="detail-card">
                        <dt>{dictionary.staff.cases.caseCountLabel}</dt>
                        <dd>{event.case_count}</dd>
                      </div>
                      <div className="detail-card">
                        <dt>{dictionary.staff.cases.lastUpdatedLabel}</dt>
                        <dd>{dateFormatter.format(new Date(event.last_updated_at))}</dd>
                      </div>
                    </div>
                  </div>

                  <dl className="detail-grid">
                    <div className="detail-card">
                      <dt>{dictionary.staff.cases.urgencyLabel}</dt>
                      <dd>{dictionary.home.form.urgency.options[event.highest_urgency]}</dd>
                    </div>
                    <div className="detail-card">
                      <dt>{dictionary.staff.cases.openCasesLabel}</dt>
                      <dd>{event.open_case_count}</dd>
                    </div>
                    <div className="detail-card">
                      <dt>{dictionary.staff.cases.assignedLabel}</dt>
                      <dd>
                        {event.unassigned_case_count === 0
                          ? dictionary.staff.cases.allAssigned
                          : `${event.unassigned_case_count} ${dictionary.staff.cases.unassigned}`}
                      </dd>
                    </div>
                    <div className="detail-card">
                      <dt>{dictionary.staff.cases.updateChainLabel}</dt>
                      <dd>{event.update_chain_count}</dd>
                    </div>
                    <div className="detail-card detail-card-wide">
                      <dt>{dictionary.staff.cases.latestUpdateLabel}</dt>
                      <dd>{event.latest_public_update ?? dictionary.staff.cases.latestUpdateFallback}</dd>
                    </div>
                  </dl>

                  <div>
                    <h4 className="section-title">{dictionary.staff.cases.relatedCasesTitle}</h4>
                    <ol className="staff-related-case-list">
                      {event.related_cases.map((item) => (
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

function getPublishStateLabel(
  dictionary: Dictionary,
  publishState: "awaiting_verification" | "ready_to_publish" | "published",
) {
  if (publishState === "awaiting_verification") {
    return dictionary.staff.cases.publishStates.awaitingVerification;
  }
  if (publishState === "ready_to_publish") {
    return dictionary.staff.cases.publishStates.readyToPublish;
  }
  return dictionary.staff.cases.publishStates.published;
}

function toQueueResponse(dashboard: ReturnType<typeof buildStaffDashboardData>): StaffQueueResponse {
  return {
    source: "staff-queue-adapter",
    events: dashboard.events.map((event) => ({
      id: event.id,
      title: event.title,
      status: event.status,
      publish_state: event.publishState,
      subject_name: null,
      source_relationship: null,
      update_chain_count: 0,
      report_kind: null,
      case_count: event.caseCount,
      open_case_count: event.openCaseCount,
      unassigned_case_count: event.unassignedCaseCount,
      highest_urgency: event.highestUrgency,
      incident_type: event.incidentType,
      last_updated_at: event.lastUpdatedAt,
      summary: event.summary,
      latest_public_update: event.latestPublicUpdate,
      related_cases: event.relatedCases,
    })),
    summary: {
      total_events: dashboard.summary.totalEvents,
      total_cases: dashboard.summary.totalCases,
      open_cases: dashboard.summary.openCases,
      unassigned_cases: dashboard.summary.unassignedCases,
      critical_cases: dashboard.summary.criticalCases,
      awaiting_verification_groups: dashboard.summary.awaitingVerificationGroups,
      ready_to_publish_groups: dashboard.summary.readyToPublishGroups,
      published_groups: dashboard.summary.publishedGroups,
      last_updated_at: dashboard.summary.lastUpdatedAt,
    },
  };
}
