"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  logoutStaffSession,
  markStaffCaseDeceased,
  markStaffCaseSafe,
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
  StaffAttachment,
  SubjectType,
  OperationalStatus,
} from "@/lib/api-types";
import type { Dictionary, Locale } from "@/lib/i18n";
import { buildStaffDashboardData } from "@/lib/staff-dashboard";
import { mockStaffDashboardCases, mockStaffDashboardSession } from "@/lib/staff-dashboard-mocks";
import { getReportPrimaryText, selectDefaultIncidentId, summarizeReports } from "@/lib/staff-reports";
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
      router.replace(buildStaffLoginHref(locale, "logged_out"));
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

  async function reloadWorkspace() {
    if (state.status !== "ready" || state.mode !== "live") {
      return;
    }
    const accessToken = state.accessToken ?? readStoredStaffAccessToken();
    const [dashboard, reports] = await Promise.all([
      withStaffAuthorization(accessToken, getStaffPublishQueue),
      withStaffAuthorization(accessToken, (token) => getStaffReports(token, state.selectedIncidentId)),
    ]);
    setState({
      ...state,
      dashboard,
      reports,
    });
  }

  if (state.status === "loading") {
    return (
      <AppShell
        homeLabel={dictionary.staff.login.backHome}
        languageLabel={dictionary.home.languagePicker}
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
        homeLabel={dictionary.staff.login.backHome}
        languageLabel={dictionary.home.languagePicker}
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
  const reportSummary = summarizeReports(state.reports.reports);
  const activeIncidents = state.incidents.filter((incident) => incident.status === "active");
  const selectedIncident = state.incidents.find((incident) => incident.id === state.selectedIncidentId) ?? null;
  const reportsNeedingReview = state.reports.reports.filter((report) => report.triage_status === "awaiting_review");
  const taskCases = dashboard.events
    .flatMap((group) => group.related_cases)
    .filter((task) => state.selectedIncidentId === null || task.incident_id === state.selectedIncidentId);
  const taskSummary = summarizeTasks(taskCases);

  return (
    <AppShell
      contentVariant="wide"
      homeLabel={dictionary.staff.login.backHome}
      languageLabel={dictionary.home.languagePicker}
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
            <p className="lede emergency-lede">
              {dictionary.staff.cases.taskBoardDescription}
            </p>
          </div>
        </div>

        <section className="staff-dashboard-source" aria-labelledby="staff-dashboard-source-title">
          <p className="field-hint compact-copy" id="staff-dashboard-source-title">
            {state.session.user.email} · {dictionary.staff.roleLabels[state.session.user.role]} ·{" "}
            {dictionary.staff.cases.operationalStatuses.unassigned}: {taskSummary.unassigned} ·{" "}
            {dictionary.staff.cases.operationalStatuses.inProgress}: {taskSummary.inProgress} ·{" "}
            {dictionary.staff.cases.operationalStatuses.personFoundAlive}: {taskSummary.foundAlive} ·{" "}
            {dictionary.staff.cases.operationalStatuses.personConfirmedDeceased}: {taskSummary.confirmedDeceased} ·{" "}
            {dictionary.staff.cases.reportsLabel}: {reportSummary.total} ·{" "}
            {dictionary.staff.cases.lastUpdatedLabel}{" "}
            {dashboard.summary.last_updated_at
              ? dateFormatter.format(new Date(dashboard.summary.last_updated_at))
              : dictionary.staff.cases.lastUpdatedFallback}
          </p>
        </section>

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

        <section className="staff-case-list" aria-labelledby="staff-task-list-title">
          <div className="staff-section-header">
            <div>
              <h2 className="section-title" id="staff-task-list-title">
                {dictionary.staff.cases.taskListTitle}
              </h2>
              <p className="field-hint compact-copy">
                {dictionary.staff.cases.taskListDescription}
              </p>
            </div>
            {state.mode === "live" && activeIncidents.length > 1 ? (
              <label className="field-label compact-copy staff-event-filter">
                {dictionary.staff.cases.currentEventLabel}
                <select
                  className="input-field"
                  value={state.selectedIncidentId ?? ""}
                  onChange={(event) => void handleIncidentChange(event.target.value)}
                >
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
          </div>

          {taskCases.length === 0 ? (
            <p className="support-copy">{dictionary.staff.cases.noHelpRequestsYet}</p>
          ) : (
            <div className="staff-case-stack">
              {taskCases.map((task) => (
                <TaskCard
                  accessToken={state.accessToken}
                  dateFormatter={dateFormatter}
                  key={task.id}
                  locale={locale}
                  dictionary={dictionary}
                  onReload={() => void reloadWorkspace()}
                  currentUserId={state.session.user.id}
                  sessionRole={state.session.user.role}
                  task={task}
                />
              ))}
            </div>
          )}
        </section>

        <section className="staff-case-list staff-secondary-section" aria-labelledby="staff-report-list-title">
          <div className="staff-section-header">
            <div>
              <h2 className="section-title" id="staff-report-list-title">
                {dictionary.staff.cases.incomingReportsTitle}
              </h2>
              <p className="field-hint compact-copy">
                {dictionary.staff.cases.needsReviewLabel}: {reportSummary.untriaged} ·{" "}
                {dictionary.staff.cases.addedToHelpListLabel}: {reportSummary.linkedNew} ·{" "}
                {dictionary.staff.cases.combinedLabel}: {reportSummary.linkedExisting} ·{" "}
                {dictionary.staff.cases.noActionNeededLabel}: {reportSummary.rejected}
              </p>
            </div>
          </div>

          {reportsNeedingReview.length === 0 ? (
            <p className="support-copy">{dictionary.staff.cases.noReportsMatchFilter}</p>
          ) : (
            <div className="staff-case-stack">
              {reportsNeedingReview.map((report) => (
                <ReportCard
                  accessToken={state.accessToken}
                  candidateCases={taskCases.filter((item) => item.incident_id === report.incident_id)}
                  dateFormatter={dateFormatter}
                  key={report.id}
                  locale={locale}
                  dictionary={dictionary}
                  onReload={() => void reloadWorkspace()}
                  report={report}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
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
  const [selectedCaseId, setSelectedCaseId] = useState(candidateCases[0]?.id ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const primaryText = getReportPrimaryText(report);
  const submittedAt = report.submitted_at ?? report.received_at;
  const isOpen = report.triage_status === "awaiting_review";
  const linkedTaskStatus = report.linked_case?.operational_status;

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
    await runAction(() => addStaffReportNote(accessToken ?? "", report.id, note));
  }

  return (
    <article className="detail-card staff-event-card staff-compact-card">
      <div className="staff-compact-main">
        <StaffAttachmentThumbnail accessToken={accessToken} attachment={report.attachments[0]} />
        <div className="staff-compact-content">
          <div className="staff-compact-top-row">
            <h3 className="staff-compact-title">{primaryText.personName}</h3>
            {report.subject_type === "person" || report.subject_type === "pet" ? (
              <span className="status-pill status-pill-neutral">{subjectTypeLabel(dictionary, report.subject_type)}</span>
            ) : null}
            {linkedTaskStatus ? (
              <span className={getOperationalStatusClassName(linkedTaskStatus)}>
                {operationalStatusLabel(dictionary, linkedTaskStatus, report.linked_case?.subject_type ?? report.subject_type)}
              </span>
            ) : null}
          </div>
          <p className="field-hint compact-copy staff-compact-meta">
            {report.location_text}
          </p>
          <p className="field-hint compact-copy staff-compact-meta">{primaryText.ageGender}</p>
          <p className="support-copy compact-copy staff-clamped-copy">{primaryText.submissionType}</p>
          {isDetailsOpen ? (
            <div className="info-banner staff-report-details">
              <p className="compact-copy">{primaryText.currentStatus}</p>
              <p className="field-hint compact-copy">
                {dictionary.staff.cases.reportTimeLabel}: {dateFormatter.format(new Date(submittedAt))}
              </p>
            </div>
          ) : null}
        </div>
      </div>
      {isOpen ? (
        <div className="button-row staff-compact-actions">
          <button className="button-secondary" type="button" onClick={() => setIsDetailsOpen((value) => !value)}>
            {dictionary.staff.cases.viewReportAction}
          </button>
          <button
            className="button-primary"
            disabled={isSubmitting}
            type="button"
            onClick={() => void runAction(() => createFollowUpTaskFromReport(accessToken ?? "", report.id))}
          >
            {dictionary.staff.cases.addToHelpListAction}
          </button>
          {candidateCases.length > 0 ? (
            <>
              <select
                className="input-field"
                value={selectedCaseId ?? ""}
                onChange={(event) => setSelectedCaseId(Number(event.target.value))}
              >
                {candidateCases.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.person_label || task.location_summary}
                  </option>
                ))}
              </select>
              <button
                className="button-secondary"
                disabled={isSubmitting || selectedCaseId === null}
                type="button"
                onClick={() =>
                  void runAction(() =>
                    linkReportToExistingTask(accessToken ?? "", report.id, selectedCaseId ?? 0),
                  )
                }
              >
                {dictionary.staff.cases.combineReportsAction}
              </button>
            </>
          ) : null}
          <InlineNoteEditor
            dictionary={dictionary}
            disabled={isSubmitting || !accessToken}
            onSave={handleSaveReportNote}
          />
        </div>
      ) : report.linked_case ? (
        <div className="button-row staff-compact-actions">
          <Link className="button-primary staff-link-button" href={`/${locale}/staff/cases/${report.linked_case.id}`}>
            {dictionary.staff.cases.openTaskAction}
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
  const isFinal = task.operational_status === "found_alive" || task.operational_status === "confirmed_deceased";
  const isAssignedToCurrentUser = task.assigned_staff_user?.id === currentUserId;
  const canClaim = !task.assigned_staff_user && !isFinal;
  const canCoordinatorReassign = sessionRole === "coordinator" && Boolean(task.assigned_staff_user) && !isFinal;
  const canResolve = (isAssignedToCurrentUser || sessionRole === "coordinator") && Boolean(task.assigned_staff_user) && !isFinal;

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
    await runAction(() =>
      createStaffCaseAction(accessToken ?? "", task.id, {
        action_type: "note",
        note,
      }),
    );
  }

  return (
    <article className="detail-card staff-event-card staff-compact-card">
      <div className="staff-compact-main">
        <StaffAttachmentThumbnail accessToken={accessToken} attachment={task.attachments?.[0]} />
        <div className="staff-compact-content">
          <div className="staff-compact-top-row">
            <span className={getOperationalStatusClassName(task.operational_status ?? "unassigned")}>
              {operationalStatusLabel(dictionary, task.operational_status ?? "unassigned", task.subject_type ?? "unknown")}
            </span>
            {task.subject_type === "person" || task.subject_type === "pet" ? (
              <span className="status-pill status-pill-neutral">
                {subjectTypeLabel(dictionary, task.subject_type)}
              </span>
            ) : null}
            <h3 className="staff-compact-title">{task.person_label || task.location_summary}</h3>
            <span className="field-hint compact-copy">{task.case_code}</span>
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
              onClick={() => void runAction(() => markStaffCaseSafe(accessToken ?? "", task.id, {}))}
            >
              {dictionary.staff.cases.foundSafeAction}
            </button>
            <button
              className="button-secondary"
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
        <Link className="button-secondary staff-link-button" href={`/${locale}/staff/cases/${task.id}`}>
          {dictionary.staff.cases.viewDetailsAction}
        </Link>
        <InlineNoteEditor
          dictionary={dictionary}
          disabled={isSubmitting || !accessToken}
          onSave={handleSaveTaskNote}
        />
      </div>
    </article>
  );
}

function InlineNoteEditor({
  dictionary,
  disabled,
  onSave,
}: {
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
    setError(null);
    setIsSaving(true);
    try {
      await onSave(trimmedNote);
      setNote("");
      setIsOpen(false);
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen) {
    return (
      <button className="button-secondary" disabled={disabled} type="button" onClick={() => setIsOpen(true)}>
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
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
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

function redirectToLogin(
  router: ReturnType<typeof useRouter>,
  locale: Locale,
  reason: StaffAuthReason,
) {
  router.replace(buildStaffLoginHref(locale, reason));
}

function operationalStatusLabel(
  dictionary: Dictionary,
  status: OperationalStatus,
  subjectType: SubjectType,
) {
  if (status === "unassigned") {
    return dictionary.staff.cases.operationalStatuses.unassigned;
  }
  if (status === "in_progress") {
    return dictionary.staff.cases.operationalStatuses.inProgress;
  }
  if (status === "found_alive") {
    return subjectType === "pet"
      ? dictionary.staff.cases.operationalStatuses.petFoundAlive
      : dictionary.staff.cases.operationalStatuses.personFoundAlive;
  }
  return subjectType === "pet"
    ? dictionary.staff.cases.operationalStatuses.petConfirmedDeceased
    : dictionary.staff.cases.operationalStatuses.personConfirmedDeceased;
}

function getOperationalStatusClassName(status: OperationalStatus) {
  if (status === "unassigned") {
    return "status-pill status-pill-warning";
  }
  if (status === "in_progress") {
    return "status-pill status-pill-alert";
  }
  return "status-pill";
}

function summarizeTasks(tasks: StaffCaseListItem[]) {
  return tasks.reduce(
    (summary, task) => {
      const status = task.operational_status ?? "unassigned";
      if (status === "unassigned") {
        summary.unassigned += 1;
      } else if (status === "in_progress") {
        summary.inProgress += 1;
      } else if (status === "found_alive") {
        summary.foundAlive += 1;
      } else {
        summary.confirmedDeceased += 1;
      }
      return summary;
    },
    { unassigned: 0, inProgress: 0, foundAlive: 0, confirmedDeceased: 0 },
  );
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

function StaffAttachmentThumbnail({
  accessToken,
  attachment,
}: {
  accessToken: string | null;
  attachment?: StaffAttachment;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  useEffect(() => {
    if (!accessToken || !attachment) {
      setImageUrl(null);
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

  if (!attachment || !imageUrl) {
    return null;
  }

  return (
    <>
      <button
        aria-label="Open attachment preview"
        className="staff-attachment-thumb-button"
        type="button"
        onClick={() => setIsPreviewOpen(true)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" className="staff-attachment-thumb" src={imageUrl} />
      </button>
      {isPreviewOpen ? (
        <div className="staff-attachment-preview" role="dialog" aria-modal="true">
          <button
            className="staff-attachment-preview-close button-secondary"
            type="button"
            onClick={() => setIsPreviewOpen(false)}
          >
            Close preview
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" className="staff-attachment-preview-image" src={imageUrl} />
        </div>
      ) : null}
    </>
  );
}
