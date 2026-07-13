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
import { PageHeader } from "@/components/page-header";

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
  const queueGroups = getOpenQueueGroups(dashboard);

  return (
    <main className="page-shell">
      <div className="page-card page-card-wide staff-dashboard-shell">
        <PageHeader
          homeLabel={dictionary.staff.login.backHome}
          languageLabel={dictionary.home.languagePicker}
          locale={locale}
          publicBoardLabel={dictionary.home.boardCta}
          sectionLabel={dictionary.staff.eyebrow}
          trailingAction={
            <button
              className="button-secondary page-header-link"
              disabled={isLoggingOut}
              type="button"
              onClick={handleLogout}
            >
              {isLoggingOut ? dictionary.staff.logoutSubmitting : dictionary.staff.logout}
            </button>
          }
        />
        <div className="staff-toolbar">
          <div>
            <h1 className="headline headline-compact staff-headline">{dictionary.staff.cases.title}</h1>
            <p className="lede emergency-lede">{dictionary.staff.cases.description}</p>
          </div>
        </div>

        <section className="staff-dashboard-source" aria-labelledby="staff-dashboard-source-title">
          <p className="field-hint compact-copy" id="staff-dashboard-source-title">
            {state.session.user.email} · {dictionary.staff.roleLabels[state.session.user.role]} ·{" "}
            {dictionary.staff.cases.summaryCards.openCases}: {dashboard.summary.open_cases} ·{" "}
            {dictionary.staff.cases.lastUpdatedLabel}{" "}
            {dashboard.summary.last_updated_at
              ? dateFormatter.format(new Date(dashboard.summary.last_updated_at))
              : dictionary.staff.cases.lastUpdatedFallback}
          </p>
        </section>

        <section className="staff-case-list" aria-labelledby="staff-event-list-title">
          <div className="staff-section-header">
            <h2 className="section-title" id="staff-event-list-title">
              {dictionary.staff.cases.listTitle}
            </h2>
            <p className="field-hint compact-copy">
              {dictionary.staff.cases.summaryCards.unassigned}: {dashboard.summary.unassigned_cases}
            </p>
          </div>

          {queueGroups.length === 0 ? (
            <p className="support-copy">{dictionary.staff.cases.empty}</p>
          ) : (
            <div className="staff-case-stack">
              {queueGroups.map((group) => {
                const leadCase = getLeadOpenCase(group);
                const caseCodes = group.related_cases.map((item) => item.case_code).join(" + ");
                const isMergedGroup = group.case_count > 1;

                return (
                <article className="detail-card staff-event-card" key={group.id}>
                  <div className="staff-case-header">
                    <div>
                      <div className="staff-card-badges">
                        <p className={getStatusPillClassName(group.status)}>
                          {dictionary.caseStatus.labels[group.status]}
                        </p>
                        {isMergedGroup ? (
                          <p className="status-pill status-pill-neutral">
                            {dictionary.staff.cases.mergedGroupLabel}
                          </p>
                        ) : null}
                      </div>
                      <p className="field-hint compact-copy">{caseCodes}</p>
                      <h3 className="section-title staff-case-title">{group.title}</h3>
                      <p className="field-hint compact-copy staff-event-summary-line">
                        {dictionary.home.form.incidentType.options[group.incident_type]} ·{" "}
                        {dictionary.home.form.urgency.options[group.highest_urgency]} ·{" "}
                        {dictionary.staff.cases.caseCountLabel}: {group.case_count}
                      </p>
                      <p className="support-copy compact-copy">{group.summary}</p>
                    </div>
                    <div className="staff-card-side">
                      <p className="field-hint compact-copy">
                        {dictionary.staff.cases.assignedLabel}:{" "}
                        {leadCase?.assigned_staff_user?.email ?? dictionary.staff.cases.unassigned}
                      </p>
                      <p className="field-hint compact-copy staff-event-summary-line">
                        {dictionary.staff.cases.lastUpdatedLabel}{" "}
                        {dateFormatter.format(new Date(group.last_updated_at))}
                      </p>
                    </div>
                  </div>

                  {isMergedGroup ? (
                    <div className="staff-merged-case-list" aria-label={dictionary.staff.cases.mergedCasesLabel}>
                      {group.related_cases.map((item) => (
                        <div className="staff-merged-case-row" key={item.id}>
                          <span className="field-hint compact-copy">{item.case_code}</span>
                          <span>{item.location_summary}</span>
                          <span className={getStatusPillClassName(item.status)}>
                            {dictionary.caseStatus.labels[item.status]}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <Link
                    className="button-primary staff-link-button"
                    href={`/${locale}/staff/cases/${leadCase?.id ?? group.related_cases[0]?.id}`}
                  >
                    {dictionary.staff.cases.openCase}
                  </Link>
                </article>
                );
              })}
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

function getOpenQueueGroups(dashboard: StaffQueueResponse) {
  return dashboard.events
    .filter((group) => group.related_cases.some((item) => item.status !== "safe_resolved" && item.status !== "closed"))
    .sort((left, right) => {
      const urgency = urgencyPriority[right.highest_urgency] - urgencyPriority[left.highest_urgency];
      return urgency || Date.parse(right.last_updated_at) - Date.parse(left.last_updated_at);
    });
}

function getLeadOpenCase(group: StaffQueueResponse["events"][number]) {
  return (
    group.related_cases.find((item) => item.status !== "safe_resolved" && item.status !== "closed") ??
    group.related_cases[0] ??
    null
  );
}

const urgencyPriority = { critical: 4, high: 3, medium: 2, low: 1 } as const;

function getStatusPillClassName(status: StaffQueueResponse["events"][number]["status"]) {
  if (status === "pending_review" || status === "waiting_for_information") {
    return "status-pill status-pill-warning";
  }
  return "status-pill status-pill-alert";
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
