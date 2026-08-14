"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addStaffReportNote,
  assignStaffCaseToSelf,
  ApiError,
  createStaffCaseAction,
  createFollowUpTaskFromReport,
  getCurrentStaffSession,
  getStaffIncidents,
  getStaffPublishQueue,
  getStaffReports,
  importStaffIncidentIntakeSource,
  logoutStaffSession,
  markStaffCaseDeceased,
  markStaffCaseSafe,
  mergeStaffDuplicateCases,
  returnStaffCaseToUnassigned,
  linkReportToExistingTask,
} from "@/lib/api";
import type {
  CurrentStaffSession,
  StaffIncidentSummary,
  StaffQueueResponse,
  StaffReportInboxResponse,
  StaffReportListItem,
  StaffCaseListItem,
  StaffIntakeImportResult,
  StaffAttachment,
  SubjectType,
  OperationalStatus,
} from "@/lib/api-types";
import type { Dictionary, Locale } from "@/lib/i18n";
import { buildStaffDashboardData } from "@/lib/staff-dashboard";
import { mockStaffDashboardCases, mockStaffDashboardSession } from "@/lib/staff-dashboard-mocks";
import { getReportPrimaryText, selectDefaultIncidentId } from "@/lib/staff-reports";
import {
  buildStaffLoginHref,
  clearStaffAccessToken,
  MissingStaffSessionError,
  readStoredStaffAccessToken,
  UnauthorizedStaffSessionError,
  withStaffAuthorization,
  type StaffAuthReason,
} from "@/lib/staff-session";
import { AppShell } from "@/components/app-shell";
import { PaginationControls, getPageCount, paginateItems } from "@/components/pagination-controls";
import { matchesCardSearch } from "@/lib/card-search";
import { SearchIcon } from "@/components/search-icon";
import { DuplicateCompareTable, buildCompareColumns } from "@/components/duplicate-compare-table";
import { compareNames } from "@/lib/staff-case-matches";
import { ImagePreviewDialog } from "@/components/image-preview-dialog";

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
      incidents: StaffIncidentSummary[];
      selectedIncidentId: number | null;
      reports: StaffReportInboxResponse;
    }
  | { status: "error"; message: string };

const mockDashboardEnabled = process.env.NEXT_PUBLIC_ENABLE_STAFF_DASHBOARD_MOCKS === "true";
const staffListPageSize = 12;
// Long enough to be unobtrusive, short enough that a new report shows up
// without anyone thinking to reload.
const workspaceRefreshMs = 30_000;
const followUpStatusKeys = [
  "needs_to_be_viewed",
  "waiting_for_volunteer",
  "being_followed_up",
  "found_safe",
  "found_dead",
] as const;
const followUpStatusFilters = ["all", "my_follow_up", ...followUpStatusKeys] as const;

type FollowUpStatusFilter = (typeof followUpStatusFilters)[number];
type FollowUpStatusKey = (typeof followUpStatusKeys)[number];
type FollowUpCaseItem = {
  kind: "case";
  status: FollowUpStatusKey;
  searchTerms: Array<string | null | undefined>;
  updatedAt: string;
  assignedToCurrentUser: boolean;
  task: StaffCaseListItem;
};
type FollowUpReportItem = {
  kind: "report";
  status: FollowUpStatusKey;
  searchTerms: Array<string | null | undefined>;
  updatedAt: string;
  report: StaffReportListItem;
  candidateCases: StaffCaseListItem[];
};
type FollowUpItem = FollowUpCaseItem | FollowUpReportItem;
type DuplicateGroup = {
  key: string;
  label: string;
  cases: StaffCaseListItem[];
  reports: StaffReportListItem[];
};

const followUpStatusSortOrder: Record<FollowUpStatusKey, number> = {
  needs_to_be_viewed: 0,
  waiting_for_volunteer: 1,
  being_followed_up: 2,
  found_safe: 3,
  found_dead: 4,
};

export function StaffCaseListPage({ dictionary, locale }: StaffCaseListPageProps) {
  const router = useRouter();
  const [state, setState] = useState<PageState>({ status: "loading" });
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [followUpPage, setFollowUpPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<FollowUpStatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showDuplicateReview, setShowDuplicateReview] = useState(false);
  const selectedIncidentIdForEffect = state.status === "ready" ? state.selectedIncidentId : null;

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
              incidents: [],
              selectedIncidentId: null,
              reports: { reports: [] },
            });
            return;
          }

          throw new MissingStaffSessionError();
        }

        const [session, dashboard, incidents] = await Promise.all([
          withStaffAuthorization(token, getCurrentStaffSession),
          withStaffAuthorization(token, getStaffPublishQueue),
          withStaffAuthorization(token, getStaffIncidents),
        ]);
        const selectedIncidentId = selectDefaultIncidentId(incidents);
        const reports = await withStaffAuthorization(token, (staffToken) =>
          getStaffReports(staffToken, selectedIncidentId),
        );

        if (!isMounted) {
          return;
        }

        setState({
          status: "ready",
          accessToken: token,
          mode: "live",
          session,
          dashboard,
          incidents,
          selectedIncidentId,
          reports,
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
              incidents: [],
              selectedIncidentId: null,
              reports: { reports: [] },
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
            incidents: [],
            selectedIncidentId: null,
            reports: { reports: [] },
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

  useEffect(() => {
    setFollowUpPage(1);
  }, [searchQuery, selectedIncidentIdForEffect, statusFilter]);

  // Keep the queue current without anyone pressing reload. Polling rather than a
  // socket: the server has nothing to push that this does not already fetch, and
  // the delay that matters is the sheet import, not this hop.
  const reloadRef = useRef<() => void>(() => {});
  // Set while a reload is already in flight, so ticks cannot stack up.
  const isBusyRef = useRef(false);
  useEffect(() => {
    const timer = window.setInterval(() => {
      // A hidden tab does not need refreshing, and an in-flight request or an
      // open editor must not be interrupted by state being replaced underneath.
      if (document.visibilityState !== "visible") {
        return;
      }
      reloadRef.current();
    }, workspaceRefreshMs);
    return () => window.clearInterval(timer);
  }, []);

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
      window.dispatchEvent(new Event("Reach.staff-session-changed"));
      router.replace(buildStaffLoginHref("logged_out"));
    }
  }

  async function handleIncidentChange(value: string) {
    if (state.status !== "ready" || state.mode !== "live") {
      return;
    }

    const selectedIncidentId = value === "all" ? null : Number(value);
    const accessToken = state.accessToken ?? readStoredStaffAccessToken();

    try {
      const reports = await withStaffAuthorization(accessToken, (token) =>
        getStaffReports(token, selectedIncidentId),
      );
      setState({
        ...state,
        selectedIncidentId,
        reports,
      });
    } catch (error) {
      if (error instanceof MissingStaffSessionError) {
        redirectToLogin(router, locale, "missing");
        return;
      }
      if (error instanceof UnauthorizedStaffSessionError) {
        redirectToLogin(router, locale, error.reason);
        return;
      }
      setState({ status: "error", message: dictionary.staff.cases.errors.server });
    }
  }

  reloadRef.current = () => {
    if (isBusyRef.current) {
      return;
    }
    void reloadWorkspace();
  };

  async function reloadWorkspace() {
    if (state.status !== "ready" || state.mode !== "live") {
      return;
    }
    const accessToken = state.accessToken ?? readStoredStaffAccessToken();
    isBusyRef.current = true;
    try {
      const [dashboard, incidents, reports] = await Promise.all([
        withStaffAuthorization(accessToken, getStaffPublishQueue),
        withStaffAuthorization(accessToken, getStaffIncidents),
        withStaffAuthorization(accessToken, (token) => getStaffReports(token, state.selectedIncidentId)),
      ]);
      setState({
        ...state,
        dashboard,
        incidents,
        reports,
      });
    } finally {
      isBusyRef.current = false;
    }
  }

  if (state.status === "loading") {
    return (
      <AppShell
        locale={locale}
        publicBoardLabel={dictionary.home.boardCta}
        sectionLabel={dictionary.staff.eyebrow}
      >
        <p className="lede">{dictionary.staff.session.loading}</p>
      </AppShell>
    );
  }

  if (state.status === "error") {
    return (
      <AppShell
        locale={locale}
        publicBoardLabel={dictionary.home.boardCta}
        sectionLabel={dictionary.staff.eyebrow}
      >
        <h1 className="headline">{dictionary.staff.cases.title}</h1>
        <p className="error-banner" role="alert">
          {state.message}
        </p>
        <div className="button-row">
          <button className="button-primary" type="button" onClick={() => window.location.reload()}>
            {dictionary.staff.cases.retry}
          </button>
        </div>
      </AppShell>
    );
  }

  const dashboard = state.dashboard;
  const activeIncidents = state.incidents.filter((incident) => incident.status === "active");
  const selectedIncident = state.incidents.find((incident) => incident.id === state.selectedIncidentId) ?? null;
  // `status !== "closed"` used to be filtered out here, but mark-deceased sets
  // status=CLOSED while mark-safe sets SAFE_RESOLVED — so confirmed deaths
  // vanished from the dashboard and its counters while still being published on
  // the public board (dashboard said 0 deceased, board showed 5). Every case in
  // the incident is counted now; the status tiles do the narrowing.
  const taskCases = dashboard.events
    .flatMap((group) => group.related_cases)
    .filter(
      (task) => state.selectedIncidentId === null || task.incident_id === state.selectedIncidentId,
    );
  const reportsNeedingReview = state.reports.reports.filter((report) => report.triage_status === "awaiting_review");
  const myFollowUpCaseCount = taskCases.filter((task) => task.assigned_staff_user?.id === state.session.user.id).length;
  const followUpSummary = summarizeFollowUpItems(taskCases, reportsNeedingReview);
  const followUpFilterCounts: Record<FollowUpStatusFilter, number> = {
    all: followUpSummary.total,
    my_follow_up: myFollowUpCaseCount,
    needs_to_be_viewed: followUpSummary.needs_to_be_viewed,
    waiting_for_volunteer: followUpSummary.waiting_for_volunteer,
    being_followed_up: followUpSummary.being_followed_up,
    found_safe: followUpSummary.found_safe,
    found_dead: followUpSummary.found_dead,
  };
  const followUpItems: FollowUpItem[] = [
    ...reportsNeedingReview.map((report) => ({
      kind: "report" as const,
      status: "needs_to_be_viewed" as const,
      searchTerms: [
        report.person_name,
        report.report_code,
        report.linked_case?.case_code,
        report.location_text,
        report.original_narrative_preview,
      ],
      updatedAt: report.submitted_at ?? report.received_at,
      report,
      candidateCases: taskCases.filter((item) => item.incident_id === report.incident_id),
    })),
    ...taskCases.map((task) => ({
      kind: "case" as const,
      status: getTaskFollowUpStatus(task),
      searchTerms: [task.person_label, task.case_code, task.location_summary, task.needs_summary, task.reporter_phone],
      updatedAt: task.platform_last_updated_at ?? task.updated_at,
      assignedToCurrentUser: task.assigned_staff_user?.id === state.session.user.id,
      task,
    })),
  ].sort(compareFollowUpItems);
  const duplicateGroups = buildDuplicateGroups(followUpItems);
  const searchedFollowUpItems = searchQuery
    ? followUpItems.filter((item) => matchesCardSearch(item.searchTerms, searchQuery))
    : null;
  const filteredFollowUpItems = followUpItems.filter((item) => {
    if (statusFilter === "all") {
      return true;
    }
    if (statusFilter === "my_follow_up") {
      return item.kind === "case" && item.assignedToCurrentUser;
    }
    return item.status === statusFilter;
  });
  const visibleFollowUpItems = searchedFollowUpItems ?? filteredFollowUpItems;
  const followUpPageCount = getPageCount(visibleFollowUpItems.length, staffListPageSize);
  const visibleFollowUpPage = Math.min(followUpPage, followUpPageCount);
  const pagedFollowUpItems = paginateItems(visibleFollowUpItems, visibleFollowUpPage, staffListPageSize);

  return (
    <AppShell
      contentVariant="wide"
      locale={locale}
      logoutAction={
        <button
          className="button-secondary header-nav-button"
          disabled={isLoggingOut}
          type="button"
          onClick={handleLogout}
        >
          {isLoggingOut ? dictionary.staff.logoutSubmitting : dictionary.staff.logout}
        </button>
      }
      publicBoardLabel={dictionary.home.boardCta}
      sectionLabel={dictionary.staff.eyebrow}
    >
      <div className="staff-dashboard-shell">
        <div className="staff-toolbar">
          <div>
            <h1 className="headline headline-compact staff-headline">{dictionary.staff.cases.taskBoardTitle}</h1>
            <p className="lede emergency-lede">{dictionary.staff.cases.taskBoardDescription}</p>
          </div>
          <div className="staff-toolbar-controls">
            {state.mode === "live" && activeIncidents.length > 1 ? (
              <label className="field-label compact-copy staff-event-filter">
                {dictionary.staff.cases.currentEventLabel}
                <select
                  className="input-field"
                  value={state.selectedIncidentId === null ? "all" : String(state.selectedIncidentId)}
                  onChange={(event) => void handleIncidentChange(event.target.value)}
                >
                  <option value="all">{dictionary.staff.cases.allIncidentsLabel}</option>
                  {activeIncidents.map((incident) => (
                    <option key={incident.id} value={incident.id}>
                      {incident.public_name}
                    </option>
                  ))}
                </select>
              </label>
            ) : selectedIncident ? (
              <p className="field-hint compact-copy staff-current-event-label">
                {dictionary.staff.cases.currentEventLabel}: {selectedIncident.public_name}
              </p>
            ) : null}
            {/* Importing was manual and had no UI at all, so new form responses
                sat in the sheet until someone ran a script. */}
            {state.mode === "live" ? (
              <SheetSyncControl
                accessToken={state.accessToken}
                canSync={state.session.user.role === "coordinator"}
                dateFormatter={dateFormatter}
                incidents={state.incidents}
                selectedIncidentId={state.selectedIncidentId}
                onSynced={() => void reloadWorkspace()}
              />
            ) : null}
          </div>
        </div>

        <section className="detail-card staff-guide-panel" aria-labelledby="staff-action-guide-title">
          <h2 className="section-title" id="staff-action-guide-title">
            {dictionary.staff.cases.actionGuideTitle}
          </h2>
          <ol className="staff-guide-list">
            {dictionary.staff.cases.actionGuideSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <section className="detail-card staff-overview-panel" aria-labelledby="staff-overview-title">
          <div className="staff-section-header staff-overview-header">
            <div>
              <h2 className="section-title" id="staff-overview-title">
                {dictionary.staff.cases.followUpOverviewTitle}
              </h2>
              <p className="field-hint compact-copy">{dictionary.staff.cases.followUpOverviewDescription}</p>
            </div>
            <p className="field-hint compact-copy staff-overview-meta">
              {state.session.user.email} · {dictionary.staff.roleLabels[state.session.user.role]} ·{" "}
              {dashboard.summary.last_updated_at
                ? `${dictionary.staff.cases.lastUpdatedLabel} ${dateFormatter.format(new Date(dashboard.summary.last_updated_at))}`
                : dictionary.staff.cases.lastUpdatedFallback}
            </p>
          </div>
          <div className="staff-stat-grid" role="listbox" aria-label={dictionary.staff.cases.followUpOverviewTitle}>
            {followUpStatusFilters.map((filter) => (
              <button
                className="staff-stat-card"
                aria-selected={statusFilter === filter}
                data-active={statusFilter === filter}
                data-tone={isFollowUpStatusKey(filter) ? filter : undefined}
                key={filter}
                role="option"
                type="button"
                onClick={() => setStatusFilter(filter)}
              >
                <span>{followUpFilterLabel(dictionary, filter)}</span>
                <strong>{followUpFilterCounts[filter]}</strong>
              </button>
            ))}
          </div>
        </section>

        <section className="staff-case-list staff-secondary-section" aria-labelledby="staff-follow-up-title">
          <div className="staff-section-header">
            <div>
              <h2 className="section-title" id="staff-follow-up-title">
                {dictionary.staff.cases.followUpListTitle}
              </h2>
              <p className="field-hint compact-copy">{dictionary.staff.cases.followUpListDescription}</p>
            </div>
          </div>

          <DuplicateReviewPanel
            accessToken={state.accessToken}
            dateFormatter={dateFormatter}
            dictionary={dictionary}
            duplicateGroups={duplicateGroups}
            isOpen={showDuplicateReview}
            onReload={() => void reloadWorkspace()}
            onToggle={() => setShowDuplicateReview((value) => !value)}
          />

          {/* Directly above the list it filters — it used to sit in the section
              header, separated from the results by the duplicates panel. */}
          <div className="staff-search-bar">
            <label className="staff-search-field">
              <span className="sr-only">{dictionary.staff.cases.searchLabel}</span>
              <SearchIcon className="staff-search-icon" />
              <input
                className="input-field"
                type="search"
                value={searchQuery}
                placeholder={dictionary.staff.cases.searchPlaceholder}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </label>
            <p className="staff-search-count">
              {searchQuery.trim()
                ? `${visibleFollowUpItems.length} of ${followUpItems.length}`
                : `${followUpItems.length} cards`}
            </p>
          </div>

          {followUpItems.length === 0 ? (
            <p className="support-copy">{dictionary.staff.cases.noFollowUpItemsYet}</p>
          ) : visibleFollowUpItems.length === 0 ? (
            <p className="support-copy">{dictionary.staff.cases.noFollowUpItemsMatchFilter}</p>
          ) : (
            <>
              <div className="staff-case-stack">
                {pagedFollowUpItems.map((item) =>
                  item.kind === "case" ? (
                    <TaskCard
                      accessToken={state.accessToken}
                      dateFormatter={dateFormatter}
                      key={`case-${item.task.id}`}
                      locale={locale}
                      dictionary={dictionary}
                      onReload={() => void reloadWorkspace()}
                      currentUserId={state.session.user.id}
                      sessionRole={state.session.user.role}
                      task={item.task}
                    />
                  ) : (
                    <ReportCard
                      accessToken={state.accessToken}
                      candidateCases={item.candidateCases}
                      dateFormatter={dateFormatter}
                      key={`report-${item.report.id}`}
                      locale={locale}
                      dictionary={dictionary}
                      onReload={() => void reloadWorkspace()}
                      report={item.report}
                    />
                  ),
                )}
              </div>
              <PaginationControls
                currentPage={visibleFollowUpPage}
                labels={dictionary.staff.cases.pagination}
                pageSize={staffListPageSize}
                totalItems={visibleFollowUpItems.length}
                onPageChange={setFollowUpPage}
              />
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function DuplicateReviewPanel({
  accessToken,
  dateFormatter,
  dictionary,
  duplicateGroups,
  isOpen,
  onReload,
  onToggle,
}: {
  accessToken: string | null;
  dateFormatter: Intl.DateTimeFormat;
  dictionary: Dictionary;
  duplicateGroups: DuplicateGroup[];
  isOpen: boolean;
  onReload: () => void;
  onToggle: () => void;
}) {
  const [primaryByGroup, setPrimaryByGroup] = useState<Record<string, number>>({});
  const [submittingGroup, setSubmittingGroup] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Pagination state for duplicate groups
  const [dupPage, setDupPage] = useState(1);
  const dupPageSize = 3; // Keep it compact and paginated!

  // Reset pagination if the groups change
  useEffect(() => {
    setDupPage(1);
  }, [duplicateGroups.length]);

  async function handleMergeGroup(group: DuplicateGroup) {
    if (!accessToken || submittingGroup) {
      return;
    }
    const primaryCase = group.cases.find((item) => item.id === primaryByGroup[group.key]) ?? group.cases[0];
    if (!primaryCase) {
      return;
    }
    const duplicateCaseIds = group.cases.filter((item) => item.id !== primaryCase.id).map((item) => item.id);
    setSubmittingGroup(group.key);
    setError(null);
    setMessage(null);
    try {
      const note = `Merged same-name duplicate group "${group.label}" into ${primaryCase.case_code}.`;
      if (duplicateCaseIds.length > 0) {
        await mergeStaffDuplicateCases(accessToken, primaryCase.id, {
          duplicate_case_ids: duplicateCaseIds,
          note,
        });
      }
      for (const report of group.reports) {
        await linkReportToExistingTask(accessToken, report.id, primaryCase.id);
      }
      setMessage(dictionary.staff.cases.duplicateMergeSuccess);
      onReload();
    } catch (error) {
      setError(error instanceof ApiError ? error.message : dictionary.staff.cases.duplicateMergeError);
    } finally {
      setSubmittingGroup(null);
    }
  }

  const totalGroups = duplicateGroups.length;
  const pagedDuplicateGroups = duplicateGroups.slice(
    (dupPage - 1) * dupPageSize,
    dupPage * dupPageSize
  );

  return (
    <section className="detail-card staff-duplicate-review" aria-labelledby="staff-duplicate-review-title">
      <div className="staff-section-header staff-duplicate-review-header">
        <div>
          <h3 className="section-title" id="staff-duplicate-review-title">
            {dictionary.staff.cases.duplicateReviewTitle}
          </h3>
          <p className="field-hint compact-copy">{dictionary.staff.cases.duplicateReviewDescription}</p>
        </div>
        {/* Once the groups have been dealt with the panel should be dismissable,
            rather than staying open for the rest of the session. */}
        <button
          className="button-merge staff-duplicate-toggle"
          type="button"
          aria-expanded={isOpen}
          onClick={onToggle}
        >
          {isOpen ? "Close" : dictionary.staff.cases.findDuplicatesAction}
          {!isOpen && duplicateGroups.length > 0 ? (
            <span className="staff-duplicate-count">{duplicateGroups.length}</span>
          ) : null}
        </button>
      </div>
      {message ? <p className="success-banner compact-copy">{message}</p> : null}
      {error ? (
        <p className="error-banner compact-copy" role="alert">
          {error}
        </p>
      ) : null}
      {isOpen ? (
        duplicateGroups.length === 0 ? (
          <p className="support-copy compact-copy">{dictionary.staff.cases.duplicateReviewEmpty}</p>
        ) : (
          <>
            <div className="staff-duplicate-scroll-container" style={{ maxHeight: "520px", overflowY: "auto", display: "grid", gap: "1.25rem", paddingRight: "0.5rem" }}>
              {pagedDuplicateGroups.map((group) => {
                const primaryCaseId = primaryByGroup[group.key] ?? group.cases[0]?.id;
                // Which case everything in this group will be folded into.
                const primaryCaseLabel =
                  group.cases.find((item) => item.id === primaryCaseId)?.case_code ??
                  group.cases[0]?.case_code;
                return (
                  <article className="staff-duplicate-group" key={group.key}>
                    
                    {/* Left Column: Comparison Area */}
                    <div className="staff-duplicate-compare-pane">
                      <div className="staff-duplicate-compare-header">
                        <strong>{group.label}</strong>
                        <span className="field-hint compact-copy">
                          ({group.cases.length} case{group.cases.length === 1 ? "" : "s"} · {group.reports.length} report{group.reports.length === 1 ? "" : "s"})
                        </span>
                      </div>
                      {/* Aligned field comparison: two truncated narratives side by
                          side could not show which record was right, or what one
                          knew that the other did not. */}
                      <DuplicateCompareTable
                        columns={buildCompareColumns(group.cases, group.reports, (value) =>
                          dateFormatter.format(new Date(value)),
                        )}
                      />
                      <div className="staff-duplicate-compare-list">
                        {/* Render cases */}
                        {group.cases.map((candidate) => (
                          <div key={`case-${candidate.id}`} className="staff-duplicate-compare-card" data-type="case">
                            <div className="staff-duplicate-card-header">
                              <span className="staff-duplicate-card-code">{candidate.case_code}</span>
                              <span className="staff-status-badge" data-status={candidate.operational_status ?? "unassigned"}>
                                <span className="status-dot" />
                                {operationalStatusLabel(dictionary, candidate.operational_status ?? "unassigned")}
                              </span>
                            </div>
                            <div className="staff-duplicate-card-body">
                              <div className="staff-attribute-row">
                                <span className="attribute-label">Location:</span>
                                <span className="attribute-value">{candidate.location_summary || "Not provided"}</span>
                              </div>
                              <div className="staff-attribute-row">
                                <span className="attribute-label">Details:</span>
                                <span className="attribute-value staff-clamped-val">{candidate.needs_summary || "No description"}</span>
                              </div>
                              <div className="staff-attribute-row">
                                <span className="attribute-label">Updated:</span>
                                <span className="attribute-value">{candidate.updated_at ? new Date(candidate.updated_at).toLocaleDateString() : "Unknown"}</span>
                              </div>

                              {/* Direct Primary Selector */}
                              <div style={{ marginTop: "0.75rem", borderTop: "1px solid rgba(255, 255, 255, 0.06)", paddingTop: "0.5rem", display: "flex", justifyContent: "flex-end" }}>
                                {primaryCaseId === candidate.id ? (
                                  <span className="status-pill status-pill-success" style={{ fontSize: "0.75rem", fontWeight: "bold", padding: "0.2rem 0.5rem", background: "rgba(16, 185, 129, 0.15)", border: "1px solid rgba(16, 185, 129, 0.3)", color: "#10b981", borderRadius: "0.25rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                                    <span style={{ width: "6px", height: "6px", background: "#10b981", borderRadius: "50%" }} />
                                    Primary Case
                                  </span>
                                ) : (
                                  <button
                                    className="button-secondary"
                                    type="button"
                                    style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem", lineHeight: "1" }}
                                    onClick={() => {
                                      setPrimaryByGroup((current) => ({
                                        ...current,
                                        [group.key]: candidate.id,
                                      }));
                                    }}
                                  >
                                    Set as Primary
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                        {/* Render reports */}
                        {group.reports.map((report) => (
                          <div key={`report-${report.id}`} className="staff-duplicate-compare-card" data-type="report">
                            <div className="staff-duplicate-card-header">
                              <span className="staff-duplicate-card-code">{report.report_code}</span>
                              <span className="staff-status-badge" data-status="needs_to_be_viewed">
                                <span className="status-dot" />
                                Need to be viewed
                              </span>
                            </div>
                            <div className="staff-duplicate-card-body">
                              <div className="staff-attribute-row">
                                <span className="attribute-label">Location:</span>
                                <span className="attribute-value">{report.location_text || "Not provided"}</span>
                              </div>
                              <div className="staff-attribute-row">
                                <span className="attribute-label">Details:</span>
                                <span className="attribute-value staff-clamped-val">{report.original_narrative_preview || "No description"}</span>
                              </div>
                              <div className="staff-attribute-row">
                                <span className="attribute-label">Source:</span>
                                <span className="attribute-value">{report.source_label || "Form Ingest"}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Right Column: Decision Area */}
                    <div className="staff-duplicate-decision-pane">
                      {group.cases.length > 0 ? (
                        <div className="staff-decision-box">
                          <p className="field-hint compact-copy" style={{ marginBottom: "1rem", textAlign: "center" }}>
                            Merging into: <strong style={{ color: "#fff" }}>{primaryCaseLabel}</strong>
                          </p>
                          <button
                            className="button-primary staff-merge-btn"
                            disabled={submittingGroup === group.key}
                            type="button"
                            onClick={() => void handleMergeGroup(group)}
                          >
                            {submittingGroup === group.key
                              ? dictionary.staff.cases.noteSaving
                              : dictionary.staff.cases.mergeDuplicateGroupAction}
                          </button>
                        </div>
                      ) : (
                        <div className="staff-duplicate-dashed-box">
                          <p className="field-hint compact-copy" style={{ marginBottom: "0.75rem", textAlign: "center" }}>
                            No active cases found. Convert a report to start:
                          </p>
                          <div style={{ display: "grid", gap: "0.5rem", width: "100%" }}>
                            {group.reports.map((report) => (
                              <button
                                key={report.id}
                                className="button-secondary staff-create-case-btn"
                                type="button"
                                disabled={submittingGroup === group.key}
                                onClick={async () => {
                                  if (!accessToken) return;
                                  setSubmittingGroup(group.key);
                                  try {
                                    await createFollowUpTaskFromReport(accessToken, report.id);
                                    onReload();
                                  } catch {
                                    setError(dictionary.staff.cases.duplicateMergeError);
                                  } finally {
                                    setSubmittingGroup(null);
                                  }
                                }}
                              >
                                Create Case from {report.report_code}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
            {totalGroups > dupPageSize && (
              <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
                <PaginationControls
                  currentPage={dupPage}
                  labels={dictionary.staff.cases.pagination}
                  pageSize={dupPageSize}
                  totalItems={totalGroups}
                  onPageChange={setDupPage}
                />
              </div>
            )}
          </>
        )
      ) : null}
    </section>
  );
}

function ReportCard({
  accessToken,
  candidateCases,
  dateFormatter,
  locale,
  dictionary,
  onReload,
  report,
}: {
  accessToken: string | null;
  candidateCases: StaffCaseListItem[];
  dateFormatter: Intl.DateTimeFormat;
  locale: Locale;
  dictionary: Dictionary;
  onReload: () => void;
  report: StaffReportListItem;
}) {
  const [candidateSearch, setCandidateSearch] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [noteBadge, setNoteBadge] = useState<string | null>(null);
  const primaryText = getReportPrimaryText(report);
  const submittedAt = report.submitted_at ?? report.received_at;
  const isOpen = report.triage_status === "awaiting_review";
  const reportFollowUpStatus = getReportFollowUpStatus(report);
  const linkedTaskStatus = report.linked_case?.operational_status;
  const trimmedCandidateSearch = candidateSearch.trim();
  const searchableCandidateCases = trimmedCandidateSearch
    ? candidateCases.filter((task) =>
        matchesCardSearch(
          [task.person_label, task.case_code, task.location_summary, task.needs_summary, task.reporter_phone],
          trimmedCandidateSearch,
        ),
      )
    : [];
  const bestCandidateCase = searchableCandidateCases[0] ?? null;

  async function runAction(action: () => Promise<unknown>) {
    if (!accessToken || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    try {
      await action();
      onReload();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveReportNote(note: string) {
    if (!accessToken || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    try {
      await addStaffReportNote(accessToken, report.id, note);
      setNoteBadge(note);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <article className="detail-card staff-event-card staff-compact-card">
      <div className="staff-compact-main">
        <StaffCardAvatar
          accessToken={accessToken}
          attachment={report.attachments[0]}
          fallbackLabel={report.person_name ?? report.report_code}
        />
        <div className="staff-compact-content">
          <div className="staff-compact-top-row">
            <span className={getFollowUpStatusClassName(reportFollowUpStatus)}>
              {followUpStatusLabel(dictionary, reportFollowUpStatus)}
            </span>
            {report.subject_type === "person" || report.subject_type === "pet" ? (
              <span className="status-pill status-pill-neutral">{subjectTypeLabel(dictionary, report.subject_type)}</span>
            ) : null}
            <h3 className="staff-compact-title">{primaryText.personName}</h3>
            {linkedTaskStatus ? (
              <span className={getOperationalStatusClassName(linkedTaskStatus)}>
                {operationalStatusLabel(dictionary, linkedTaskStatus)}
              </span>
            ) : null}
            {noteBadge ? <NoteBadge dictionary={dictionary} note={noteBadge} /> : null}
          </div>
          {report.linked_case ? (
            <p className="field-hint compact-copy staff-compact-meta">
              {dictionary.staff.cases.linkedCaseLabel}: {report.linked_case.case_code} ·{" "}
              {operationalStatusLabel(dictionary, report.linked_case.operational_status)}
            </p>
          ) : null}
          <p className="field-hint compact-copy staff-compact-meta">
            {report.location_text}
          </p>
          <p className="field-hint compact-copy staff-compact-meta">{primaryText.ageGender}</p>
          <p className="support-copy compact-copy staff-clamped-copy">{primaryText.submissionType}</p>
        </div>
      </div>
      {isOpen ? (
        <div className="button-row staff-compact-actions">
          <Link className="button-secondary staff-link-button" href={`/staff/reports/${report.id}`}>
            {dictionary.staff.cases.viewReportAction}
          </Link>
          <button
            className="button-primary"
            disabled={isSubmitting}
            type="button"
            onClick={() => void runAction(() => createFollowUpTaskFromReport(accessToken ?? "", report.id))}
          >
            {dictionary.staff.cases.addToHelpListAction}
          </button>
          {candidateCases.length > 0 ? (
            <button
              className="button-secondary"
              type="button"
              onClick={() => setIsMergeOpen((value) => !value)}
            >
              {dictionary.staff.cases.combineReportsAction}
            </button>
          ) : null}
          {report.linked_case ? (
            <Link className="button-primary staff-link-button" href={`/staff/cases/${report.linked_case.id}`}>
              {dictionary.staff.cases.openCombinedCaseAction}
            </Link>
          ) : null}
          <InlineNoteEditor
            currentNote={noteBadge}
            dictionary={dictionary}
            disabled={isSubmitting || !accessToken}
            onSave={handleSaveReportNote}
          />
          {isMergeOpen && candidateCases.length > 0 ? (
            <div className="staff-merge-panel">
              <label className="field-label compact-copy staff-merge-search">
                {dictionary.staff.cases.mergeSearchLabel}
                <input
                  className="input-field"
                  type="search"
                  value={candidateSearch}
                  placeholder={dictionary.staff.cases.mergeSearchPlaceholder}
                  onChange={(event) => setCandidateSearch(event.target.value)}
                />
              </label>
              {!trimmedCandidateSearch ? null : bestCandidateCase ? (
                <div className="staff-merge-candidate">
                  <div>
                    <strong>{bestCandidateCase.person_label || bestCandidateCase.location_summary}</strong>
                    <span>
                      {bestCandidateCase.case_code}
                      {bestCandidateCase.last_known_location || bestCandidateCase.location_summary
                        ? ` · ${bestCandidateCase.last_known_location || bestCandidateCase.location_summary}`
                        : ""}
                    </span>
                  </div>
                  <button
                    className="button-secondary"
                    disabled={isSubmitting}
                    type="button"
                    onClick={() =>
                      void runAction(() =>
                        linkReportToExistingTask(accessToken ?? "", report.id, bestCandidateCase.id),
                      )
                    }
                  >
                    {dictionary.staff.cases.combineReportsAction}
                  </button>
                </div>
              ) : (
                <p className="field-hint compact-copy">{dictionary.staff.cases.mergeSearchEmpty}</p>
              )}
            </div>
          ) : null}
        </div>
      ) : report.linked_case ? (
        <div className="button-row staff-compact-actions">
          <Link className="button-secondary staff-link-button" href={`/staff/reports/${report.id}`}>
            {dictionary.staff.cases.viewReportAction}
          </Link>
          <Link className="button-primary staff-link-button" href={`/staff/cases/${report.linked_case.id}`}>
            {dictionary.staff.cases.openCombinedCaseAction}
          </Link>
        </div>
      ) : null}
    </article>
  );
}

function TaskCard({
  accessToken,
  dateFormatter,
  locale,
  dictionary,
  onReload,
  currentUserId,
  sessionRole,
  task,
}: {
  accessToken: string | null;
  dateFormatter: Intl.DateTimeFormat;
  locale: Locale;
  dictionary: Dictionary;
  onReload: () => void;
  currentUserId: number;
  sessionRole: "volunteer" | "coordinator";
  task: StaffCaseListItem;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [noteBadge, setNoteBadge] = useState<string | null>(null);
  const isFinal = task.operational_status === "found_alive" || task.operational_status === "confirmed_deceased";
  const isAssignedToCurrentUser = task.assigned_staff_user?.id === currentUserId;
  const canClaim = !task.assigned_staff_user && !isFinal;
  const canCoordinatorReassign = sessionRole === "coordinator" && Boolean(task.assigned_staff_user) && !isFinal;
  // Same rule as the case detail page: only the assigned reviewer records an
  // outcome. Otherwise the list would be a way around that rule.
  const canResolve = isAssignedToCurrentUser && !isFinal;

  async function runAction(action: () => Promise<unknown>) {
    if (!accessToken || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    try {
      await action();
      onReload();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveTaskNote(note: string) {
    if (!accessToken || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    try {
      await createStaffCaseAction(accessToken, task.id, {
        action_type: "note",
        note,
      });
      setNoteBadge(note);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <article className="detail-card staff-event-card staff-compact-card">
      <div className="staff-compact-main">
        <StaffCardAvatar
          accessToken={accessToken}
          attachment={task.attachments?.[0]}
          fallbackLabel={task.person_label ?? task.case_code}
        />
        <div className="staff-compact-content">
          <div className="staff-compact-top-row">
            <span className={getOperationalStatusClassName(task.operational_status ?? "unassigned")}>
              {operationalStatusLabel(dictionary, task.operational_status ?? "unassigned")}
            </span>
            {task.subject_type === "person" || task.subject_type === "pet" ? (
              <span className="status-pill status-pill-neutral">
                {subjectTypeLabel(dictionary, task.subject_type)}
              </span>
            ) : null}
            <h3 className="staff-compact-title">{task.person_label || task.location_summary}</h3>
            <span className="field-hint compact-copy">{task.case_code}</span>
            {noteBadge ? <NoteBadge dictionary={dictionary} note={noteBadge} /> : null}
          </div>
          <p className="field-hint compact-copy staff-compact-meta">
            {dictionary.staff.cases.lastSeenLabel}: {task.last_known_location || task.location_summary}
            {task.approximate_age ? ` · ${dictionary.staff.cases.ageLabel}: ${task.approximate_age}` : ""} ·{" "}
            {dateFormatter.format(new Date(task.platform_last_updated_at ?? task.updated_at))}
          </p>
          <p className="support-copy compact-copy staff-clamped-copy">{task.needs_summary}</p>
          {task.reporter_phone ? (
            <p className="field-hint compact-copy staff-compact-meta">
              {dictionary.staff.cases.phoneLabel}: {task.reporter_phone}
            </p>
          ) : null}
        </div>
      </div>
      <div className="button-row staff-compact-actions">
        {canClaim || canCoordinatorReassign ? (
          <button
            className="button-primary"
            disabled={isSubmitting}
            type="button"
            onClick={() => void runAction(() => assignStaffCaseToSelf(accessToken ?? "", task.id))}
          >
            {canCoordinatorReassign
              ? dictionary.staff.cases.reassignToMeAction
              : dictionary.staff.cases.claimAction}
          </button>
        ) : null}
        {canResolve ? (
          <>
            <button
              className="button-primary"
              disabled={isSubmitting}
              type="button"
              onClick={() => {
                // Closing a case as safe also publishes to the public board, so it
                // gets the same confirmation step as confirming a death.
                if (window.confirm(dictionary.staff.detail.confirmSafePrompt)) {
                  void runAction(() => markStaffCaseSafe(accessToken ?? "", task.id, {}));
                }
              }}
            >
              {dictionary.staff.cases.foundSafeAction}
            </button>
            <button
              className="button-danger"
              disabled={isSubmitting}
              type="button"
              onClick={() => {
                if (window.confirm(dictionary.staff.cases.confirmDeathPrompt)) {
                  void runAction(() => markStaffCaseDeceased(accessToken ?? "", task.id, {}));
                }
              }}
            >
              {dictionary.staff.cases.confirmDeathAction}
            </button>
            <button
              className="button-secondary"
              disabled={isSubmitting}
              type="button"
              onClick={() => void runAction(() => returnStaffCaseToUnassigned(accessToken ?? "", task.id))}
            >
              {dictionary.staff.cases.returnAction}
            </button>
          </>
        ) : null}
        <Link className="button-secondary staff-link-button" href={`/staff/cases/${task.id}`}>
          {dictionary.staff.cases.viewDetailsAction}
        </Link>
        <InlineNoteEditor
          currentNote={noteBadge}
          dictionary={dictionary}
          disabled={isSubmitting || !accessToken}
          onSave={handleSaveTaskNote}
        />
      </div>
    </article>
  );
}

function InlineNoteEditor({
  currentNote,
  dictionary,
  disabled,
  onSave,
}: {
  currentNote: string | null;
  dictionary: Dictionary;
  disabled: boolean;
  onSave: (note: string) => Promise<void>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit() {
    const trimmedNote = note.trim();
    if (!trimmedNote) {
      setError(dictionary.staff.cases.noteRequired);
      return;
    }
    if (trimmedNote.length > 100) {
      setError(dictionary.staff.cases.noteTooLong);
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await onSave(trimmedNote);
      setNote("");
      setIsOpen(false);
    } catch {
      setError(dictionary.staff.cases.noteSaveError);
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen) {
    return (
      <button
        className="button-secondary"
        disabled={disabled}
        type="button"
        onClick={() => {
          setNote(currentNote ?? "");
          setError(null);
          setIsOpen(true);
        }}
      >
        {dictionary.staff.cases.noteAction}
      </button>
    );
  }

  return (
    <div className="staff-inline-note">
      <label className="field-label">
        {dictionary.staff.cases.noteLabel}
        <textarea
          className="input-field"
          disabled={disabled || isSaving}
          maxLength={100}
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <p className="field-hint compact-copy">{note.length}/100</p>
      {error ? <p className="error-text">{error}</p> : null}
      <div className="button-row staff-inline-note-actions">
        <button className="button-secondary" disabled={isSaving} type="button" onClick={() => setIsOpen(false)}>
          {dictionary.staff.cases.noteCancelAction}
        </button>
        <button className="button-primary" disabled={disabled || isSaving} type="button" onClick={() => void handleSubmit()}>
          {isSaving ? dictionary.staff.cases.noteSaving : dictionary.staff.cases.noteSaveAction}
        </button>
      </div>
    </div>
  );
}

/**
 * Pulls the Google Sheet on demand and reports what changed.
 *
 * The import endpoint existed and `importStaffIncidentIntakeSource` was already
 * written, but nothing called it — so a submitted form stayed invisible until a
 * coordinator ran scripts/import_google_sheets_intake.sh by hand.
 */
function SheetSyncControl({
  accessToken,
  canSync,
  dateFormatter,
  incidents,
  selectedIncidentId,
  onSynced,
}: {
  accessToken: string | null;
  canSync: boolean;
  dateFormatter: Intl.DateTimeFormat;
  incidents: StaffIncidentSummary[];
  selectedIncidentId: number | null;
  onSynced: () => void;
}) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [result, setResult] = useState<StaffIntakeImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only sheet-backed sources can be pulled, and only for the selected event.
  const sources = incidents
    .filter((incident) => selectedIncidentId === null || incident.id === selectedIncidentId)
    .flatMap((incident) =>
      incident.intake_sources
        .filter((source) => source.is_active && source.source_type === "google_sheets")
        .map((source) => ({ incidentId: incident.id, source })),
    );

  if (sources.length === 0) {
    return null;
  }

  const lastImportedAt = sources
    .map((entry) => entry.source.last_imported_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  async function handleSync() {
    if (!accessToken || isSyncing) {
      return;
    }
    setIsSyncing(true);
    setError(null);
    setResult(null);
    try {
      let totals: StaffIntakeImportResult | null = null;
      for (const entry of sources) {
        const response = await importStaffIncidentIntakeSource(
          accessToken,
          entry.incidentId,
          entry.source.id,
        );
        totals = totals
          ? {
              ...response,
              imported: totals.imported + response.imported,
              skipped: totals.skipped + response.skipped,
              failed: totals.failed + response.failed,
              withdrawn: totals.withdrawn + response.withdrawn,
              errors: [...totals.errors, ...response.errors],
            }
          : response;
      }
      setResult(totals);
      onSynced();
    } catch (syncError) {
      setError(
        syncError instanceof ApiError && syncError.status === 403
          ? "Only coordinators can sync the sheet."
          : "The sheet could not be synced. Check the connection and try again.",
      );
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="staff-sync-control">
      <div className="staff-sync-row">
        {canSync ? (
          <button
            className="button-secondary staff-sync-button"
            disabled={isSyncing || !accessToken}
            type="button"
            onClick={() => void handleSync()}
          >
            {isSyncing ? "Syncing..." : "Sync sheet"}
          </button>
        ) : null}
        <span className="staff-sync-meta">
          {lastImportedAt
            ? `Last synced ${dateFormatter.format(new Date(lastImportedAt))}`
            : "Never synced"}
        </span>
      </div>
      {result ? (
        <p className="staff-sync-result" role="status">
          {`${result.imported} new \u00b7 ${result.skipped} unchanged`}
          {result.withdrawn > 0 ? ` \u00b7 ${result.withdrawn} withdrawn` : ""}
          {result.failed > 0 ? ` \u00b7 ${result.failed} failed` : ""}
        </p>
      ) : null}
      {result && result.errors.length > 0 ? (
        <p className="staff-sync-error" role="alert">
          {result.errors[0]}
        </p>
      ) : null}
      {error ? (
        <p className="staff-sync-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function NoteBadge({ dictionary, note }: { dictionary: Dictionary; note: string }) {
  return (
    <span className="status-pill status-pill-neutral staff-note-pill" title={note}>
      {dictionary.staff.cases.noteBadgeLabel}: {note}
    </span>
  );
}

function redirectToLogin(
  router: ReturnType<typeof useRouter>,
  locale: Locale,
  reason: StaffAuthReason,
) {
  router.replace(buildStaffLoginHref(reason));
}

function getTaskFollowUpStatus(task: StaffCaseListItem): FollowUpStatusKey {
  const status = task.operational_status ?? "unassigned";
  if (status === "in_progress") {
    return "being_followed_up";
  }
  if (status === "found_alive") {
    return "found_safe";
  }
  if (status === "confirmed_deceased") {
    return "found_dead";
  }
  return "waiting_for_volunteer";
}

function getReportFollowUpStatus(report: StaffReportListItem): FollowUpStatusKey {
  if (report.triage_status === "awaiting_review") {
    return "needs_to_be_viewed";
  }
  return "waiting_for_volunteer";
}

function followUpStatusLabel(dictionary: Dictionary, status: FollowUpStatusKey) {
  return dictionary.staff.cases.followUpStatusFilters[status];
}

function followUpFilterLabel(dictionary: Dictionary, filter: FollowUpStatusFilter) {
  if (filter === "my_follow_up") {
    return dictionary.staff.cases.myFollowUpTitle;
  }
  if (filter === "all") {
    return dictionary.staff.cases.followUpStatusFilters.all;
  }
  return followUpStatusLabel(dictionary, filter);
}

function isFollowUpStatusKey(filter: FollowUpStatusFilter): filter is FollowUpStatusKey {
  return filter !== "all" && filter !== "my_follow_up";
}

/**
 * Cluster cards that may describe the same subject.
 *
 * This used to group on an exact normalised name, which is a different
 * algorithm from the one the case detail page uses — so the two features
 * disagreed by construction. Exact matching also missed the variants that
 * actually occur: reversed order, a dropped accent, a typo. Clustering now uses
 * the shared `compareNames` verdict.
 */
function buildDuplicateGroups(items: FollowUpItem[]): DuplicateGroup[] {
  const named = items
    .map((item) => ({
      item,
      label: (item.kind === "case" ? item.task.person_label : item.report.person_name) ?? "",
    }))
    .filter((entry) => normalizeDuplicateName(entry.label));

  const groups: Array<{ key: string; label: string; entries: typeof named }> = [];
  for (const entry of named) {
    const existing = groups.find((group) =>
      group.entries.some(({ label }) => {
        const verdict = compareNames(label, entry.label);
        return verdict === "same" || verdict === "similar";
      }),
    );
    if (existing) {
      existing.entries.push(entry);
    } else {
      groups.push({
        key: normalizeDuplicateName(entry.label) ?? entry.label,
        label: entry.label.trim(),
        entries: [entry],
      });
    }
  }

  return groups
    .map((group) => ({
      key: group.key,
      label: group.label,
      cases: group.entries.filter((e) => e.item.kind === "case").map((e) => (e.item as FollowUpCaseItem).task),
      reports: group.entries
        .filter((e) => e.item.kind === "report")
        .map((e) => (e.item as FollowUpReportItem).report),
    }))
    .filter((group) => group.cases.length + group.reports.length > 1)
    .sort((left, right) => right.cases.length + right.reports.length - (left.cases.length + left.reports.length));
}

function normalizeDuplicateName(value: string | null | undefined) {
  const normalized = value
    ?.toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized && normalized.length >= 2 ? normalized : null;
}

function getFollowUpStatusClassName(status: FollowUpStatusKey) {
  if (status === "waiting_for_volunteer") {
    return "status-pill status-pill-purple";
  }
  if (status === "being_followed_up") {
    return "status-pill status-pill-warning";
  }
  if (status === "found_safe") {
    return "status-pill status-pill-success";
  }
  if (status === "found_dead") {
    return "status-pill status-pill-alert";
  }
  return "status-pill status-pill-info";
}

function operationalStatusLabel(
  dictionary: Dictionary,
  status: OperationalStatus,
) {
  if (status === "unassigned") {
    return dictionary.staff.cases.followUpStatusFilters.waiting_for_volunteer;
  }
  if (status === "in_progress") {
    return dictionary.staff.cases.followUpStatusFilters.being_followed_up;
  }
  if (status === "found_alive") {
    return dictionary.staff.cases.followUpStatusFilters.found_safe;
  }
  return dictionary.staff.cases.followUpStatusFilters.found_dead;
}

function getOperationalStatusClassName(status: OperationalStatus) {
  if (status === "unassigned") {
    return "status-pill status-pill-purple";
  }
  if (status === "in_progress") {
    return "status-pill status-pill-warning";
  }
  if (status === "found_alive") {
    return "status-pill status-pill-success";
  }
  return "status-pill status-pill-alert";
}

function summarizeFollowUpItems(tasks: StaffCaseListItem[], reports: StaffReportListItem[]) {
  return [...tasks, ...reports].reduce(
    (summary, item) => {
      const status = "triage_status" in item ? getReportFollowUpStatus(item) : getTaskFollowUpStatus(item);
      summary.total += 1;
      summary[status] += 1;
      return summary;
    },
    {
      total: 0,
      needs_to_be_viewed: 0,
      waiting_for_volunteer: 0,
      being_followed_up: 0,
      found_safe: 0,
      found_dead: 0,
    } satisfies Record<"total" | FollowUpStatusKey, number>,
  );
}

function compareFollowUpItems(
  left:
    | {
        kind: "case";
        status: FollowUpStatusKey;
        updatedAt: string;
      }
    | {
        kind: "report";
        status: FollowUpStatusKey;
        updatedAt: string;
      },
  right:
    | {
        kind: "case";
        status: FollowUpStatusKey;
        updatedAt: string;
      }
    | {
        kind: "report";
        status: FollowUpStatusKey;
        updatedAt: string;
      },
) {
  const leftPriority = followUpStatusSortOrder[left.status];
  const rightPriority = followUpStatusSortOrder[right.status];
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }
  const leftUpdatedAt = Date.parse(left.updatedAt);
  const rightUpdatedAt = Date.parse(right.updatedAt);
  if (leftUpdatedAt !== rightUpdatedAt) {
    return rightUpdatedAt - leftUpdatedAt;
  }
  if (left.kind !== right.kind) {
    return left.kind === "report" ? -1 : 1;
  }
  return 0;
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

function subjectTypeLabel(dictionary: Dictionary, subjectType: SubjectType) {
  return dictionary.subjectTypes[subjectType];
}

function StaffCardAvatar({
  accessToken,
  attachment,
  fallbackLabel,
}: {
  accessToken: string | null;
  attachment?: StaffAttachment;
  fallbackLabel: string;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  useEffect(() => {
    if (!accessToken || !attachment) {
      setImageUrl(null);
      setIsPreviewOpen(false);
      return;
    }
    let isMounted = true;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const response = await fetch(`/api/staff/attachments/${attachment.id}/content`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }
        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (isMounted) {
          setImageUrl(objectUrl);
        }
      } catch {
        if (isMounted) {
          setImageUrl(null);
        }
      }
    })();

    return () => {
      isMounted = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [accessToken, attachment]);

  return (
    <>
      <div className="staff-avatar-shell" aria-label={fallbackLabel} title={fallbackLabel}>
        {imageUrl ? (
          <button
            aria-label="Open attachment preview"
            className="staff-avatar-button"
            type="button"
            onClick={() => setIsPreviewOpen(true)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" className="staff-avatar-image" src={imageUrl} />
          </button>
        ) : (
          <div className="staff-avatar-placeholder" aria-hidden="true">
            <span className="staff-avatar-mark">?</span>
          </div>
        )}
      </div>
      {imageUrl && isPreviewOpen ? (
        <ImagePreviewDialog
          imageUrl={imageUrl}
          label={`Attachment preview for ${fallbackLabel}`}
          variant="avatar"
          onClose={() => setIsPreviewOpen(false)}
        />
      ) : null}
    </>
  );
}
