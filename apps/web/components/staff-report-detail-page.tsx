"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  getCurrentStaffSession,
  getStaffReportDetail,
  getStaffPublishQueue,
  createFollowUpTaskFromReport,
  linkReportToExistingTask,
  addStaffReportNote,
  logoutStaffSession,
} from "@/lib/api";
import type {
  CurrentStaffSession,
  StaffReportDetailResponse,
  StaffCaseListItem,
} from "@/lib/api-types";
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
import { parseNarrativeFields } from "@/lib/staff-narrative";
import { AppShell } from "@/components/app-shell";

type StaffReportDetailPageProps = {
  dictionary: Dictionary;
  locale: Locale;
  reportId: number;
};

type ReportDetailState =
  | { status: "loading" }
  | {
      status: "ready";
      accessToken: string;
      session: CurrentStaffSession;
      report: StaffReportDetailResponse;
      candidateCases: StaffCaseListItem[];
    }
  | { status: "not-found" }
  | { status: "error"; message: string };

export function StaffReportDetailPage({
  dictionary,
  locale,
  reportId,
}: StaffReportDetailPageProps) {
  const router = useRouter();
  const [state, setState] = useState<ReportDetailState>({ status: "loading" });
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Note/Triage inputs
  const [note, setNote] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [locale],
  );

  const timelineEntries = useMemo(() => {
    const triageActions = state.status === "ready" ? state.report.triage_actions : [];
    return triageActions.map((action) => {
      const isNote = action.action_type === "note";
      let title = "";
      let description = action.note ?? "";
      
      if (action.action_type === "note") {
        title = "Internal Triage Comment";
      } else if (action.action_type === "create_case") {
        title = "Promoted to Help List Case";
        description = `Created new Case #${action.case_id || ""}. ${action.note ?? ""}`;
      } else if (action.action_type === "link_existing_case") {
        title = "Merged into Case";
        description = `Linked and merged into Case #${action.case_id || ""}. ${action.note ?? ""}`;
      } else if (action.action_type === "mark_out_of_scope") {
        title = "Marked Out of Scope";
        description = action.note ?? "";
      } else if (action.action_type === "mark_invalid_or_insufficient") {
        title = "Marked Invalid / Insufficient Info";
        description = action.note ?? "";
      } else {
        title = action.action_type;
      }
      
      return {
        id: action.id,
        isNote,
        title,
        description,
        createdAt: action.created_at,
      };
    });
  }, [state]);

  const loadReport = useCallback(async () => {
    const accessToken = readStoredStaffAccessToken();
    try {
      if (!accessToken) {
        throw new MissingStaffSessionError();
      }
      const [session, report, queue] = await Promise.all([
        withStaffAuthorization(accessToken, getCurrentStaffSession),
        withStaffAuthorization(accessToken, (token) => getStaffReportDetail(token, reportId)),
        withStaffAuthorization(accessToken, getStaffPublishQueue),
      ]);

      // If report is already linked to a case, redirect to that case details page immediately.
      if (report.linked_case) {
        router.replace(`/staff/cases/${report.linked_case.id}`);
        return;
      }

      // Collect active candidate cases from the same incident to show for merging options
      const allCases = queue.events.flatMap((event) => event.related_cases);
      const candidates = allCases.filter(
        (item) => item.incident_id === report.incident_id && item.status !== "closed"
      );

      setState({
        status: "ready",
        accessToken,
        session,
        report,
        candidateCases: candidates,
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
      if (error instanceof ApiError && error.status === 404) {
        setState({ status: "not-found" });
        return;
      }
      setState({ status: "error", message: dictionary.staff.cases.errors.server });
    }
  }, [dictionary.staff.cases.errors.server, locale, reportId, router]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  async function handleLogout() {
    if (state.status !== "ready") {
      return;
    }
    setIsLoggingOut(true);
    try {
      await withStaffAuthorization(state.accessToken, logoutStaffSession);
    } finally {
      clearStaffAccessToken();
      window.dispatchEvent(new Event("Reach.staff-session-changed"));
      router.replace(buildStaffLoginHref("logged_out"));
    }
  }

  async function runAction(action: () => Promise<unknown>) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await action();
      return res;
    } catch (error) {
      setActionError(dictionary.staff.cases.errors.server);
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  }

  // Triage: convert report to a new case on the help list
  async function handleAddToHelpList() {
    if (state.status !== "ready") return;
    try {
      const result = (await runAction(() =>
        createFollowUpTaskFromReport(state.accessToken, reportId, note || undefined)
      )) as { case: { id: number } };

      if (result && result.case) {
        setActionSuccess(dictionary.staff.cases.addedToHelpListStatus);
        router.push(`/staff/cases/${result.case.id}`);
      } else {
        void loadReport();
      }
    } catch {
      // Handled in runAction
    }
  }

  // Triage: combine/link report into an existing case
  async function handleLinkToCase(caseId: number) {
    if (state.status !== "ready") return;
    try {
      await runAction(() =>
        linkReportToExistingTask(state.accessToken, reportId, caseId)
      );
      setActionSuccess(dictionary.staff.cases.mergedIntoExistingTaskLabel);
      router.push(`/staff/cases/${caseId}`);
    } catch {
      // Handled in runAction
    }
  }

  // Save an internal note without triaging/linking the report yet
  async function handleSaveNote() {
    if (state.status !== "ready") return;
    if (!note.trim()) {
      setActionError(dictionary.staff.cases.noteRequired);
      return;
    }
    if (note.length > 100) {
      setActionError(dictionary.staff.cases.noteTooLong);
      return;
    }
    try {
      await runAction(() => addStaffReportNote(state.accessToken, reportId, note));
      setNote("");
      setActionSuccess(dictionary.staff.cases.duplicateMergeSuccess);
      void loadReport();
    } catch {
      // Handled in runAction
    }
  }

  if (state.status === "loading") {
    return (
      <AppShell locale={locale} publicBoardLabel={dictionary.home.boardCta} sectionLabel={dictionary.staff.eyebrow}>
        <p className="lede">{dictionary.staff.session.loading}</p>
      </AppShell>
    );
  }

  if (state.status === "not-found") {
    return (
      <AppShell locale={locale} publicBoardLabel={dictionary.home.boardCta} sectionLabel={dictionary.staff.eyebrow}>
        <h1 className="headline">{dictionary.staff.reportDetail.notFoundTitle}</h1>
        <Link className="button-secondary staff-link-button" href="/staff">
          {dictionary.staff.reportDetail.backToList}
        </Link>
      </AppShell>
    );
  }

  if (state.status === "error") {
    return (
      <AppShell locale={locale} publicBoardLabel={dictionary.home.boardCta} sectionLabel={dictionary.staff.eyebrow}>
        <p className="error-banner" role="alert">
          {state.message}
        </p>
      </AppShell>
    );
  }

  const { report, accessToken, candidateCases } = state;
  const reportedAt = report.submitted_at ?? report.received_at;

  // Status is already shown as a badge in the page header and the actions rail,
  // so it is not repeated as a tile here.
  const reviewSummaryItems = [
    { label: "Source", value: report.source_label },
    { label: "Reporter", value: report.reporter_name || "Anonymous" },
    { label: "Contact", value: report.reporter_email || report.reporter_phone || "None" },
    { label: "Submitted", value: dateFormatter.format(new Date(reportedAt)) },
  ];
  const narrative = parseNarrativeFields(report.original_narrative);
  const trimmedCandidateSearch = candidateSearch.trim().toLowerCase();
  const filteredCandidates = !trimmedCandidateSearch
    ? []
    : candidateCases.filter(
        (item) =>
          item.case_code.toLowerCase().includes(trimmedCandidateSearch) ||
          (item.person_label && item.person_label.toLowerCase().includes(trimmedCandidateSearch)) ||
          (item.location_summary && item.location_summary.toLowerCase().includes(trimmedCandidateSearch))
      ).slice(0, 5);

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
      <div className="staff-detail-container">
        <div className="staff-detail-topbar">
          <div className="staff-detail-topbar-headings">
            <div className="staff-detail-title-row">
              <h1 className="headline headline-compact staff-headline">{dictionary.staff.reportDetail.eyebrow}</h1>
              <span className="staff-status-badge" data-status="needs_to_be_viewed">
                <span className="status-dot" />
                {dictionary.staff.cases.followUpStatusFilters.needs_to_be_viewed}
              </span>
              <span className="status-pill status-pill-neutral">{dictionary.subjectTypes[report.subject_type]}</span>
            </div>
            <p className="lede">{dictionary.staff.detail.description}</p>
          </div>
          <Link className="button-secondary staff-link-button" href="/staff">
            {dictionary.staff.reportDetail.backToList}
          </Link>
        </div>

        <div className="staff-detail-grid-layout">
          <div className="staff-detail-col-left">
            <section className="detail-card staff-review-hero" aria-labelledby="staff-report-title" style={{ margin: 0 }}>
              <div className="staff-review-hero-header">
                <div>
                  <span className="status-pill status-pill-neutral">{report.report_code}</span>
                  <h2 className="section-title staff-case-title" id="staff-report-title" style={{ marginTop: "0.5rem" }}>
                    {report.person_name || report.report_code}
                  </h2>
                  <p className="field-hint compact-copy">{report.location_text}</p>
                </div>
              </div>

              <dl className="staff-fact-grid">
                {reviewSummaryItems.map((item) => (
                  <div className="staff-fact" key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>

              <div className="staff-block">
                <h3 className="staff-block-title">Reported incident</h3>
                {narrative.fields.length > 0 ? (
                  <dl className="staff-narrative-fields">
                    {narrative.fields.map((field, index) => (
                      <Fragment key={`${field.label}-${index}`}>
                        <dt>{field.label}</dt>
                        <dd>{field.value}</dd>
                      </Fragment>
                    ))}
                  </dl>
                ) : null}
                {narrative.rest ? <p className="staff-narrative-rest">{narrative.rest}</p> : null}
                {report.current_status ? (
                  <p className="staff-narrative-rest">
                    <strong>Current status:</strong> {report.current_status}
                  </p>
                ) : null}
              </div>

              <div className="staff-block staff-divider">
                <h3 className="staff-block-title">Triage history &amp; internal comments</h3>

                <form
                  className="staff-composer"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleSaveNote();
                  }}
                >
                  <textarea
                    className="input-field"
                    maxLength={1000}
                    placeholder="Type an internal triage note or comment here..."
                    rows={2}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                  <button className="button-primary" disabled={isSubmitting || !note.trim()} type="submit">
                    {isSubmitting ? "Saving..." : "Comment"}
                  </button>
                </form>

                {timelineEntries.length === 0 ? (
                  <p className="field-hint compact-copy">No activity logged yet.</p>
                ) : (
                  <div className="staff-timeline">
                    {timelineEntries.map((entry) => (
                      <div className="staff-timeline-entry" data-note={entry.isNote} key={entry.id}>
                        <div className="staff-timeline-rail">
                          <span className="staff-timeline-dot" />
                          <span className="staff-timeline-line" />
                        </div>
                        <div>
                          <div className="staff-timeline-head">
                            <strong className="staff-timeline-title">{entry.title}</strong>
                            <span className="staff-timeline-time">
                              {dateFormatter.format(new Date(entry.createdAt))}
                            </span>
                          </div>
                          {entry.description.trim() ? (
                            <p className="staff-timeline-body">{entry.description}</p>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>

          <div className="staff-detail-col-right">
            <section
              className="detail-card staff-action-card staff-actions-rail"
              aria-labelledby="staff-report-actions-title"
            >
              <div className="staff-actions-head">
                <h2 className="section-title" id="staff-report-actions-title">
                  Triage and actions
                </h2>
              </div>

              {actionError ? (
                <p className="error-banner" role="alert" style={{ margin: 0 }}>
                  {actionError}
                </p>
              ) : null}
              {actionSuccess ? (
                <p className="info-banner" role="status" style={{ margin: 0 }}>
                  {actionSuccess}
                </p>
              ) : null}

              <p className="staff-action-note">
                Promote this report to a case, or combine it into a case that already covers this person.
              </p>

              <div className="staff-action-stack">
                <button
                  className="button-primary"
                  disabled={isSubmitting}
                  type="button"
                  onClick={() => void handleAddToHelpList()}
                >
                  {isSubmitting ? dictionary.staff.cases.noteSaving : dictionary.staff.cases.addToHelpListAction}
                </button>

                <button
                  className="button-merge"
                  disabled={isSubmitting}
                  type="button"
                  aria-expanded={isMergeOpen}
                  onClick={() => setIsMergeOpen((val) => !val)}
                >
                  {dictionary.staff.cases.combineReportsAction}
                </button>
              </div>

              {isMergeOpen ? (
                <div className="status-correction-dialog form-stack">
                  <p className="field-hint compact-copy">Search active cases to combine this report into.</p>
                  <label className="form-field">
                    <span>Search by code, name, or location</span>
                    <input
                      className="input-field"
                      type="search"
                      placeholder="Search..."
                      value={candidateSearch}
                      onChange={(e) => setCandidateSearch(e.target.value)}
                    />
                  </label>

                  {candidateSearch.trim() ? (
                    <div className="staff-merge-candidates-list" style={{ display: "grid", gap: "0.5rem" }}>
                      {filteredCandidates.length === 0 ? (
                        <p className="field-hint compact-copy">{dictionary.staff.cases.mergeSearchEmpty}</p>
                      ) : (
                        filteredCandidates.map((candidate) => (
                          <div className="staff-candidate-card detail-card-plain" key={candidate.id}>
                            <div className="staff-candidate-head">
                              <strong className="staff-candidate-name" style={{ fontSize: "0.9rem" }}>
                                {candidate.person_label || candidate.location_summary}
                              </strong>
                              <span className="staff-candidate-code">{candidate.case_code}</span>
                            </div>
                            <p className="staff-candidate-location">{candidate.location_summary}</p>
                            <div className="staff-candidate-actions">
                              <button
                                className="button-merge"
                                type="button"
                                onClick={() => void handleLinkToCase(candidate.id)}
                              >
                                Combine into this case
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function redirectToLogin(router: ReturnType<typeof useRouter>, locale: Locale, reason: StaffAuthReason) {
  router.replace(buildStaffLoginHref(reason));
}
