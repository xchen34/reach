"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  assignStaffCaseToSelf,
  ApiError,
  correctStaffCaseOperationalStatus,
  createStaffCaseAction,
  getCurrentStaffSession,
  getStaffCaseDetail,
  getStaffPublishQueue,
  listStaffCaseAudit,
  logoutStaffSession,
  markStaffCaseDeceased,
  markStaffCaseSafe,
  returnStaffCaseToUnassigned,
  relateStaffCase,
} from "@/lib/api";
import {
  type AuditLogEntryResponse,
  type CaseStatus,
  type CurrentStaffSession,
  type OperationalStatus,
  type StaffCaseListItem,
  type StaffCaseDetailResponse,
  type StaffCaseRelationType,
  type StaffQueueResponse,
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
import { AppShell } from "@/components/app-shell";
import { buildNarrativePreview, parseNarrativeFields } from "@/lib/staff-narrative";
import { findSuggestedCaseMatches } from "@/lib/staff-case-matches";

type StaffCaseDetailPageProps = {
  caseId: number;
  dictionary: Dictionary;
  locale: Locale;
};

type DetailState =
  | { status: "loading" }
  | {
      status: "ready";
      accessToken: string;
      session: CurrentStaffSession;
      caseDetail: StaffCaseDetailResponse;
      auditEntries: AuditLogEntryResponse[];
      queue: StaffQueueResponse;
    }
  | { status: "not-found" }
  | { status: "error"; message: string };

export function StaffCaseDetailPage({
  caseId,
  dictionary,
  locale,
}: StaffCaseDetailPageProps) {
  const router = useRouter();
  const [state, setState] = useState<DetailState>({ status: "loading" });
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [isSubmittingOutcome, setIsSubmittingOutcome] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isLinkingRelation, setIsLinkingRelation] = useState(false);
  const [isCorrectionOpen, setIsCorrectionOpen] = useState(false);
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [correctionTarget, setCorrectionTarget] = useState<OperationalStatus>("unassigned");
  const [correctionNote, setCorrectionNote] = useState("");
  const [isSubmittingCorrection, setIsSubmittingCorrection] = useState(false);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [locale],
  );

  const timelineEntries = useMemo(() => {
    const auditEntries = state.status === "ready" ? state.auditEntries : [];
    return auditEntries
      .filter((entry) => {
        const actionType = entry.metadata_json?.action_type;
        // The change log is for state transitions only — merges, status changes and
        // assignment. Notes are a separate, lighter-weight thing (see noteEntries).
        return (
          actionType === "relation_marked" ||
          actionType === "note" ||
          actionType === "status_change" ||
          actionType === "operational_status_correction" ||
          actionType === "claim" ||
          actionType === "duplicate_merged"
        );
      })
      .map((entry) => {
        const metadata = (entry.metadata_json ?? {}) as any;
        const isNote = metadata.action_type === "note";
        
        let title = "";
        let description = "";
        
        if (metadata.action_type === "publish_update") {
          title = "Public Update Published";
          description = metadata.latest_public_update ?? "";
        } else if (metadata.relation_type && metadata.action_type === "relation_marked") {
          title = "Case Relationship Marked";
          description = `${getRelationTypeLabel(dictionary, metadata.relation_type as StaffCaseRelationType)} · #${metadata.related_case_id}`;
        } else if (metadata.action_type === "note") {
          title = "Internal Staff Comment";
          description = metadata.note ?? "";
        } else if (metadata.action_type === "duplicate_merged") {
          title = "Duplicates Merged";
          description = metadata.note ?? `Merged duplicate case REF-${metadata.merged_case_code} into this case.`;
        } else if (metadata.action_type === "status_change" || metadata.action_type === "operational_status_correction") {
          title = "Operational Status Updated";
          const fromLabel = metadata.from_operational_status ? correctionStatusLabel(dictionary, metadata.from_operational_status as OperationalStatus) : "";
          const toLabel = metadata.to_operational_status ? correctionStatusLabel(dictionary, metadata.to_operational_status as OperationalStatus) : "";
          description = fromLabel ? `${fromLabel} ➔ ${toLabel}` : (dictionary.caseStatus.labels[metadata.to_status as CaseStatus] ?? "Status changed");
        } else if (metadata.action_type === "claim") {
          title = "Case Review Claimed";
          description = `Claimed by reviewer.`;
        } else if (entry.event_type === "case_submitted") {
          title = "Report Received";
          description = "Original report created in system.";
        } else {
          title = "System Activity";
          description = "System updated case parameters.";
        }
        
        return {
          id: entry.id,
          isNote,
          title,
          description,
          createdAt: entry.created_at,
        };
      });
  }, [state, dictionary]);

  // Notes are a small side function; state changes are the log. Keeping them in
  // one feed made the page read as if commenting were the main activity.
  const noteEntries = useMemo(
    () => timelineEntries.filter((entry) => entry.isNote && entry.description.trim()),
    [timelineEntries],
  );
  const changeEntries = useMemo(
    () => timelineEntries.filter((entry) => !entry.isNote),
    [timelineEntries],
  );

  const loadCase = useCallback(async () => {
    const accessToken = readStoredStaffAccessToken();

    try {
      const token = accessToken;
      if (!token) {
        throw new MissingStaffSessionError();
      }

      const session = await withStaffAuthorization(token, getCurrentStaffSession);
      const [caseDetail, auditEntries, queue] = await Promise.all([
        withStaffAuthorization(token, (staffAccessToken) => getStaffCaseDetail(staffAccessToken, caseId)),
        withStaffAuthorization(token, (staffAccessToken) => listStaffCaseAudit(staffAccessToken, caseId)),
        withStaffAuthorization(token, getStaffPublishQueue),
      ]);

      setState({
        status: "ready",
        accessToken: token,
        session,
        caseDetail,
        auditEntries,
        queue,
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

      if (error instanceof ApiError && error.status === null) {
        setState({ status: "error", message: dictionary.staff.detail.errors.network });
        return;
      }

      setState({ status: "error", message: dictionary.staff.detail.errors.server });
    }
  }, [
    caseId,
    dictionary.staff.detail.errors.network,
    dictionary.staff.detail.errors.server,
    locale,
    router,
  ]);

  useEffect(() => {
    void loadCase();
  }, [loadCase]);

  async function handleLogout() {
    setIsLoggingOut(true);
    const accessToken = readStoredStaffAccessToken();

    try {
      await withStaffAuthorization(accessToken, logoutStaffSession);
    } finally {
      clearStaffAccessToken();
      window.dispatchEvent(new Event("Reach.staff-session-changed"));
      router.replace(buildStaffLoginHref("logged_out"));
    }
  }

  async function handleNoteSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (state.status !== "ready") {
      return;
    }

    const trimmedNote = note.trim();
    setActionError(null);
    setActionSuccess(null);
    setNoteError(null);

    if (!trimmedNote) {
      setNoteError(dictionary.staff.detail.validation.noteRequired);
      return;
    }

    setIsSubmittingNote(true);

    try {
      await withStaffAuthorization(state.accessToken, (token) =>
        createStaffCaseAction(token, caseId, {
          action_type: "note",
          note: trimmedNote,
        }),
      );
      setNote("");
      setActionSuccess(dictionary.staff.detail.noteSuccess);
      await loadCase();
    } catch (error) {
      await handleActionError(error);
    } finally {
      setIsSubmittingNote(false);
    }
  }

  async function handleOutcome(action: "safe" | "deceased" | "return") {
    if (state.status !== "ready") {
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    setIsSubmittingOutcome(true);

    try {
      if (action === "safe") {
        await withStaffAuthorization(state.accessToken, (token) => markStaffCaseSafe(token, caseId, {}));
        setActionSuccess(dictionary.staff.detail.foundSafeSuccess);
      } else if (action === "deceased") {
        await withStaffAuthorization(state.accessToken, (token) => markStaffCaseDeceased(token, caseId, {}));
        setActionSuccess(dictionary.staff.detail.confirmDeathSuccess);
      } else {
        await withStaffAuthorization(state.accessToken, (token) => returnStaffCaseToUnassigned(token, caseId));
        setActionSuccess(dictionary.staff.detail.returnSuccess);
      }
      await loadCase();
    } catch (error) {
      await handleActionError(error);
    } finally {
      setIsSubmittingOutcome(false);
    }
  }

  async function handleClaim() {
    if (state.status !== "ready") {
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    setIsClaiming(true);

    try {
      await withStaffAuthorization(state.accessToken, (token) =>
        assignStaffCaseToSelf(token, caseId),
      );
      setActionSuccess(dictionary.staff.detail.claimSuccess);
      await loadCase();
    } catch (error) {
      await handleActionError(error);
    } finally {
      setIsClaiming(false);
    }
  }

  async function handleStatusCorrection(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (state.status !== "ready" || isSubmittingCorrection) {
      return;
    }

    const currentStatus = state.caseDetail.operational_status ?? "unassigned";
    const fromLabel = operationalStatusLabel(dictionary, currentStatus, state.caseDetail.subject_type);
    const toLabel = correctionStatusLabel(dictionary, correctionTarget);
    const prompt = dictionary.staff.detail.confirmStatusCorrectionPrompt
      .replace("{from}", fromLabel)
      .replace("{to}", toLabel);

    if (!window.confirm(prompt)) {
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    setIsSubmittingCorrection(true);

    try {
      await withStaffAuthorization(state.accessToken, (token) =>
        correctStaffCaseOperationalStatus(token, caseId, {
          target_status: correctionTarget,
          note: correctionNote.trim() || null,
        }),
      );
      setIsCorrectionOpen(false);
      setCorrectionNote("");
      setActionSuccess(dictionary.staff.detail.statusCorrectionSuccess);
      await loadCase();
    } catch (error) {
      await handleActionError(error);
    } finally {
      setIsSubmittingCorrection(false);
    }
  }

  async function handleRelation(caseToRelate: StaffCaseListItem, relationType: StaffCaseRelationType) {
    if (state.status !== "ready") {
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    setIsLinkingRelation(true);

    try {
      await withStaffAuthorization(state.accessToken, (token) =>
        relateStaffCase(token, caseId, {
          related_case_id: caseToRelate.id,
          relation_type: relationType,
        }),
      );
      setActionSuccess(dictionary.staff.detail.relationSuccess);
      await loadCase();
    } catch (error) {
      await handleActionError(error);
    } finally {
      setIsLinkingRelation(false);
    }
  }

  async function handleActionError(error: unknown) {
    if (error instanceof MissingStaffSessionError) {
      redirectToLogin(router, locale, "missing");
      return;
    }

    if (error instanceof UnauthorizedStaffSessionError) {
      redirectToLogin(router, locale, error.reason);
      return;
    }

    if (error instanceof ApiError && error.status === 403) {
      setActionError(dictionary.staff.detail.errors.forbidden);
      return;
    }

    if (error instanceof ApiError && error.status === 404) {
      setState({ status: "not-found" });
      return;
    }

    if (error instanceof ApiError && error.status === 400) {
      setActionError(dictionary.staff.detail.errors.actionRejected);
      return;
    }

    if (error instanceof ApiError && error.status === null) {
      setActionError(dictionary.staff.detail.errors.network);
      return;
    }

    setActionError(dictionary.staff.detail.errors.action);
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

  if (state.status === "not-found") {
    return (
      <AppShell
        locale={locale}
        publicBoardLabel={dictionary.home.boardCta}
        sectionLabel={dictionary.staff.eyebrow}
      >
        <h1 className="headline">{dictionary.staff.detail.notFoundTitle}</h1>
        <p className="lede">{dictionary.staff.detail.notFoundBody}</p>
        <div className="button-row">
          <Link className="button-primary" href="/staff">
            {dictionary.staff.detail.backToList}
          </Link>
        </div>
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
        <h1 className="headline">{dictionary.staff.detail.title}</h1>
        <p className="error-banner" role="alert">
          {state.message}
        </p>
        <div className="button-row">
          <button className="button-primary" type="button" onClick={() => void loadCase()}>
            {dictionary.staff.detail.retry}
          </button>
        </div>
      </AppShell>
    );
  }

  const { caseDetail, auditEntries, session, queue } = state;
  const assignedEmail = caseDetail.assigned_staff_user?.email ?? dictionary.staff.detail.unassigned;
  const subjectName = caseDetail.person_label || caseDetail.case_code;
  const locationSummary = caseDetail.location_summary.trim() || dictionary.staff.detail.summaryFallback;
  const needsSummary = caseDetail.needs_summary.trim() || dictionary.staff.detail.summaryFallback;
  const latestUpdate = caseDetail.latest_public_update ?? dictionary.staff.detail.latestUpdateFallback;
  const relatedMarkers = auditEntries
    .map((entry) => getRelatedMarker(entry))
    .filter((marker): marker is RelatedMarker => marker !== null);
  const caseOperationalStatus = caseDetail.operational_status ?? "unassigned";
  const isFinal =
    caseOperationalStatus === "found_alive" ||
    caseOperationalStatus === "confirmed_deceased";
  const isAssignedToCurrentUser = caseDetail.assigned_staff_user?.id === session.user.id;
  const canClaim = !caseDetail.assigned_staff_user && !isFinal;
  const canCoordinatorReassign =
    session.user.role === "coordinator" && Boolean(caseDetail.assigned_staff_user) && !isFinal;
  // You may only record an outcome on a case you own. An unclaimed case must be
  // claimed first, and someone else's case must be reassigned to you — so the
  // outcome is always attributable to whoever is accountable for the follow-up.
  // (The API itself is permissive here; this is the deliberate workflow rule.)
  const canRecordOutcome = isAssignedToCurrentUser && !isFinal;
  const isSomeoneElsesCase = Boolean(caseDetail.assigned_staff_user) && !isAssignedToCurrentUser;
  const isUnclaimed = !caseDetail.assigned_staff_user;
  const currentOperationalStatusLabel = operationalStatusLabel(
    dictionary,
    caseOperationalStatus,
    caseDetail.subject_type,
  );
  const narrative = parseNarrativeFields(needsSummary);
  const suggestedMatches = findSuggestedCaseMatches(caseDetail, queue.events.flatMap((event) => event.related_cases));
  const showCoordinatorTools = session.user.role === "coordinator";

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
              <h1 className="headline headline-compact staff-headline">{dictionary.staff.detail.title}</h1>
              <span className="staff-status-badge" data-status={caseOperationalStatus}>
                <span className="status-dot" />
                {currentOperationalStatusLabel}
              </span>
              {caseDetail.subject_type === "person" || caseDetail.subject_type === "pet" ? (
                <span className="status-pill status-pill-neutral">{dictionary.subjectTypes[caseDetail.subject_type]}</span>
              ) : null}
            </div>
            <p className="lede">{dictionary.staff.detail.description}</p>
          </div>
          <Link className="button-secondary staff-link-button" href="/staff">
            {dictionary.staff.detail.backToList}
          </Link>
        </div>

        <section className="staff-review-shell" aria-labelledby="staff-review-title">
          <div className="staff-review-main">

            <div className="staff-detail-grid-layout">
              {/* Left Column: Compressed Case Detail Card */}
              <div className="staff-detail-col-left">
                <section className="detail-card staff-review-hero" aria-labelledby="staff-review-title" style={{ margin: 0 }}>
                  <div className="staff-review-hero-header">
                    <div>
                      <span className="status-pill status-pill-neutral">{caseDetail.case_code}</span>
                      <h2 className="section-title staff-case-title" id="staff-review-title" style={{ marginTop: "0.5rem" }}>
                        {subjectName}
                      </h2>
                      <p className="field-hint compact-copy">{locationSummary}</p>
                    </div>
                  </div>

                  <div className="staff-block">
                    <h3 className="staff-block-title">Case needs &amp; description</h3>
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
                  </div>

                  {caseDetail.latest_public_update ? (
                    <div className="staff-block">
                      <h3 className="staff-block-title">Latest public board update</h3>
                      <p className="staff-narrative-rest">{caseDetail.latest_public_update}</p>
                    </div>
                  ) : null}
                </section>
                {showCoordinatorTools ? (
                <section className="staff-review-panel" aria-labelledby="staff-duplicates-title">
                  <div className="staff-section-heading">
                    <div>
                      <h2 className="section-title" id="staff-duplicates-title">
                        {dictionary.staff.detail.duplicateTitle}
                      </h2>
                      <p className="support-copy compact-copy">{dictionary.staff.detail.duplicateDescription}</p>
                    </div>
                  </div>
                  {suggestedMatches.length === 0 ? (
                    <p className="info-banner">{dictionary.staff.detail.noDuplicateSuggestions}</p>
                  ) : (
                    <div className="staff-case-stack">
                      {suggestedMatches.map((match) => (
                        <article className="detail-card staff-candidate-card" key={match.case.id}>
                          <div className="staff-candidate-head">
                            {/* The person is what a reviewer matches on, so it leads; the
                                address and code are supporting detail. */}
                            <h3 className="staff-candidate-name">
                              {match.case.person_label || match.case.location_summary}
                            </h3>
                            <span className="staff-candidate-code">{match.case.case_code}</span>
                          </div>
                          {match.case.person_label ? (
                            <p className="staff-candidate-location">{match.case.location_summary}</p>
                          ) : null}
                          <p className="staff-candidate-preview">
                            {buildNarrativePreview(match.case.needs_summary)}
                          </p>
                          <ul className="staff-candidate-reasons">
                            {match.reasons.map((reason) => (
                              <li key={reason}>{dictionary.staff.detail.matchReasons[reason]}</li>
                            ))}
                          </ul>
                          <div className="staff-candidate-actions">
                            <Link className="button-secondary" href={`/staff/cases/${match.case.id}`}>
                              {dictionary.staff.detail.openSuggestedCase}
                            </Link>
                            <button
                              className="button-secondary"
                              disabled={isLinkingRelation}
                              type="button"
                              onClick={() => setActionSuccess(dictionary.staff.detail.keepSeparateSuccess)}
                            >
                              {dictionary.staff.detail.keepSeparate}
                            </button>
                            <button
                              className="button-merge"
                              disabled={isLinkingRelation}
                              type="button"
                              onClick={() => void handleRelation(match.case, "confirmed_duplicate")}
                            >
                              {isLinkingRelation
                                ? dictionary.staff.detail.submitting
                                : dictionary.staff.detail.confirmDuplicate}
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                  {relatedMarkers.length > 0 ? (
                    <div className="staff-existing-relations">
                      <h3 className="section-title staff-action-title">{dictionary.staff.detail.relatedLinksTitle}</h3>
                      <ol className="staff-review-list">
                        {relatedMarkers.map((marker) => (
                          <li key={`${marker.relatedCaseId}-${marker.createdAt}-${marker.relationType}`}>
                            {getRelationTypeLabel(dictionary, marker.relationType)} · #{marker.relatedCaseId} ·{" "}
                            {dateFormatter.format(new Date(marker.createdAt))}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                </section>
                ) : null}
              </div>

              {/* Right Column: Actions Panel */}
              <div className="staff-detail-col-right">
                <section className="detail-card staff-action-card staff-actions-rail" aria-labelledby="staff-actions-title">
                  <div className="staff-actions-head">
                    <h2 className="section-title" id="staff-actions-title">
                      {dictionary.staff.detail.actionsTitle}
                    </h2>
                    <span className="staff-status-badge" data-status={caseOperationalStatus}>
                      <span className="status-dot" />
                      {currentOperationalStatusLabel}
                    </span>
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

                  <div className="form-stack" style={{ display: "grid", gap: "0.85rem" }}>
                    <dl className="staff-fact-grid staff-fact-grid-rail">
                      <div className="staff-fact">
                        <dt>{dictionary.staff.detail.assignedLabel}</dt>
                        <dd>{assignedEmail}</dd>
                      </div>
                      <div className="staff-fact">
                        <dt>{dictionary.staff.detail.updatedAtLabel}</dt>
                        <dd>{dateFormatter.format(new Date(caseDetail.updated_at))}</dd>
                      </div>
                    </dl>

                    {/* Outcomes require ownership, so the rail always explains what to
                        do first rather than showing an empty panel. */}
                    {isUnclaimed && !isFinal ? (
                      <div className="staff-action-stack">
                        <p className="staff-action-group-label">{dictionary.staff.detail.nextActionTitle}</p>
                        <p className="staff-action-note">
                          Claim this case before recording an outcome, so the decision is
                          attributable to a named reviewer.
                        </p>
                        <button
                          className="button-primary"
                          disabled={isClaiming}
                          type="button"
                          onClick={() => void handleClaim()}
                        >
                          {dictionary.staff.detail.claimSubmit}
                        </button>
                      </div>
                    ) : null}

                    {isSomeoneElsesCase && !isFinal ? (
                      <div className="staff-action-stack">
                        <p className="staff-action-warning" role="note">
                          {assignedEmail} is following this case up. Reassign it to yourself
                          before changing anything.
                        </p>
                        <button
                          className="button-primary"
                          disabled={isClaiming}
                          type="button"
                          onClick={() => void handleClaim()}
                        >
                          {dictionary.staff.detail.reassignToMeAction}
                        </button>
                      </div>
                    ) : null}

                    {canRecordOutcome ? (
                      <>
                        <div className="staff-action-stack">
                          <p className="staff-action-group-label">Record an outcome</p>
                          <button
                            className="button-primary"
                            disabled={isSubmittingOutcome}
                            type="button"
                            onClick={() => {
                              // Both outcomes close the case and publish to the public
                              // board, so both are confirmed — not just death.
                              if (window.confirm(dictionary.staff.detail.confirmSafePrompt)) {
                                void handleOutcome("safe");
                              }
                            }}
                          >
                            {dictionary.staff.detail.foundSafeAction}
                          </button>
                          <button
                            className="button-danger"
                            disabled={isSubmittingOutcome}
                            type="button"
                            onClick={() => {
                              if (window.confirm(dictionary.staff.detail.confirmDeathPrompt)) {
                                void handleOutcome("deceased");
                              }
                            }}
                          >
                            {dictionary.staff.detail.confirmDeathAction}
                          </button>
                        </div>
                        <div className="staff-action-stack">
                          <p className="staff-action-group-label">Hand back</p>
                          <button
                            className="button-secondary"
                            disabled={isSubmittingOutcome}
                            type="button"
                            onClick={() => void handleOutcome("return")}
                          >
                            {dictionary.staff.detail.returnAction}
                          </button>
                        </div>
                      </>
                    ) : null}

                    {isFinal ? (
                      <div className="staff-action-stack">
                        <p className="staff-action-note">
                          This case is closed. Reopen it only to correct a recording mistake.
                        </p>
                        <button
                          className="button-secondary"
                          type="button"
                          onClick={() => {
                            setCorrectionTarget(caseOperationalStatus);
                            setCorrectionNote("");
                            setIsCorrectionOpen(true);
                          }}
                        >
                          {dictionary.staff.detail.correctStatusAction}
                        </button>
                      </div>
                    ) : null}

                    {isCorrectionOpen ? (
                      <form
                        aria-labelledby="staff-status-correction-title"
                        className="status-correction-dialog form-stack"
                        role="dialog"
                        onSubmit={(event) => void handleStatusCorrection(event)}
                      >
                        <h4 className="section-title staff-action-title" id="staff-status-correction-title" style={{ fontSize: "0.85rem" }}>
                          {dictionary.staff.detail.statusCorrectionTitle}
                        </h4>
                        <p className="field-hint compact-copy">
                          {dictionary.staff.detail.currentStatusLabel}: {currentOperationalStatusLabel}
                        </p>
                        <label className="form-field">
                          <span>{dictionary.staff.detail.targetStatusLabel}</span>
                          <select
                            className="input-field"
                            value={correctionTarget}
                            onChange={(event) => setCorrectionTarget(event.target.value as OperationalStatus)}
                          >
                            {correctionStatusOptions.map((option) => (
                              <option key={option} value={option}>
                                {correctionStatusLabel(dictionary, option)}
                              </option>
                            ))}
                          </select>
                        </label>
                        {/* Each state name alone did not say what it means for the case. */}
                        <p className="staff-action-note">
                          {correctionStatusHint(dictionary, correctionTarget)}
                        </p>
                        <label className="form-field">
                          <span>{dictionary.staff.detail.optionalNoteLabel}</span>
                          <textarea
                            className="input-field"
                            maxLength={4000}
                            placeholder={dictionary.staff.detail.optionalNotePlaceholder}
                            rows={3}
                            value={correctionNote}
                            onChange={(event) => setCorrectionNote(event.target.value)}
                          />
                        </label>
                        <div className="button-row" style={{ display: "flex", gap: "0.5rem" }}>
                          <button
                            className="button-secondary"
                            disabled={isSubmittingCorrection}
                            type="button"
                            onClick={() => setIsCorrectionOpen(false)}
                          >
                            {dictionary.staff.detail.cancelStatusCorrection}
                          </button>
                          <button className="button-primary" disabled={isSubmittingCorrection} type="submit">
                            {isSubmittingCorrection
                              ? dictionary.staff.detail.submitting
                              : dictionary.staff.detail.confirmStatusCorrection}
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </div>
                </section>

                {/* Notes are a small side function, so they live in the rail behind a
                    toggle rather than occupying the main column. */}
                <section className="detail-card staff-rail-card" aria-labelledby="staff-notes-title">
                  <div className="staff-rail-card-head">
                    <h3 className="staff-rail-card-title" id="staff-notes-title">
                      Internal notes
                      {noteEntries.length > 0 ? (
                        <span className="staff-rail-count">{noteEntries.length}</span>
                      ) : null}
                    </h3>
                    <button
                      className="staff-rail-toggle"
                      type="button"
                      aria-expanded={isNotesOpen}
                      onClick={() => setIsNotesOpen((open) => !open)}
                    >
                      {isNotesOpen ? "Close" : "Add note"}
                    </button>
                  </div>

                  {isNotesOpen ? (
                    <form className="staff-rail-composer" onSubmit={(e) => void handleNoteSubmit(e)}>
                      {noteError ? (
                        <p className="error-banner" role="alert" style={{ margin: 0 }}>
                          {noteError}
                        </p>
                      ) : null}
                      <textarea
                        className="input-field"
                        maxLength={1000}
                        placeholder="Internal note for other reviewers..."
                        rows={3}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                      />
                      <button className="button-secondary" disabled={isSubmittingNote} type="submit">
                        {isSubmittingNote ? dictionary.staff.detail.submitting : "Save note"}
                      </button>
                    </form>
                  ) : null}

                  {noteEntries.length === 0 ? (
                    <p className="staff-rail-empty">No notes yet.</p>
                  ) : (
                    <ul className="staff-rail-notes">
                      {noteEntries.slice(0, 4).map((entry) => (
                        <li key={entry.id}>
                          <p className="staff-rail-note-body">{entry.description}</p>
                          <span className="staff-rail-note-time">
                            {dateFormatter.format(new Date(entry.createdAt))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Change log: merges, status changes and assignment only. */}
                <section className="detail-card staff-rail-card" aria-labelledby="staff-changelog-title">
                  <div className="staff-rail-card-head">
                    <h3 className="staff-rail-card-title" id="staff-changelog-title">
                      Change log
                    </h3>
                  </div>
                  {changeEntries.length === 0 ? (
                    <p className="staff-rail-empty">No changes recorded yet.</p>
                  ) : (
                    <ol className="staff-audit-compact">
                      {changeEntries.slice(0, 5).map((entry) => (
                        <li key={entry.id}>
                          <div className="staff-audit-compact-main">
                            <span className="staff-audit-compact-title">{entry.title}</span>
                            {entry.description.trim() ? (
                              <p className="staff-audit-compact-detail">{entry.description}</p>
                            ) : null}
                          </div>
                          <span className="staff-audit-compact-time">
                            {dateFormatter.format(new Date(entry.createdAt))}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              </div>
            </div>


          </div>
        </section>
      </div>
    </AppShell>
  );
}

type RelatedMarker = {
  relatedCaseId: number;
  relationType: StaffCaseRelationType;
  createdAt: string;
};

function redirectToLogin(
  router: ReturnType<typeof useRouter>,
  locale: Locale,
  reason: StaffAuthReason,
) {
  router.replace(buildStaffLoginHref(reason));
}

function getRelationTypeLabel(dictionary: Dictionary, relationType: StaffCaseRelationType) {
  switch (relationType) {
    case "related_update":
      return dictionary.staff.detail.relationTypes.relatedUpdate;
    case "possible_duplicate":
      return dictionary.staff.detail.relationTypes.possibleDuplicate;
    case "confirmed_duplicate":
      return dictionary.staff.detail.relationTypes.confirmedDuplicate;
  }
}

function getRelatedMarker(entry: AuditLogEntryResponse): RelatedMarker | null {
  const metadata = entry.metadata_json;
  if (!metadata || metadata.action_type !== "relation_marked") {
    return null;
  }

  const relatedCaseId = metadata.related_case_id;
  const relationType = metadata.relation_type;

  if (
    typeof relatedCaseId !== "number" ||
    (relationType !== "related_update" &&
      relationType !== "possible_duplicate" &&
      relationType !== "confirmed_duplicate")
  ) {
    return null;
  }

  return {
    relatedCaseId,
    relationType,
    createdAt: entry.created_at,
  };
}

const correctionStatusOptions: OperationalStatus[] = [
  "unassigned",
  "in_progress",
  "found_alive",
  "confirmed_deceased",
];

function operationalStatusLabel(
  dictionary: Dictionary,
  status: OperationalStatus,
  subjectType: StaffCaseDetailResponse["subject_type"],
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

function correctionStatusHint(dictionary: Dictionary, status: OperationalStatus) {
  if (status === "unassigned") {
    return dictionary.staff.detail.correctionStatusHints.unassigned;
  }
  if (status === "in_progress") {
    return dictionary.staff.detail.correctionStatusHints.inProgress;
  }
  if (status === "found_alive") {
    return dictionary.staff.detail.correctionStatusHints.foundAlive;
  }
  return dictionary.staff.detail.correctionStatusHints.confirmedDeceased;
}

function correctionStatusLabel(dictionary: Dictionary, status: OperationalStatus) {
  if (status === "unassigned") {
    return dictionary.staff.detail.correctionStatuses.unassigned;
  }
  if (status === "in_progress") {
    return dictionary.staff.detail.correctionStatuses.inProgress;
  }
  if (status === "found_alive") {
    return dictionary.staff.detail.correctionStatuses.foundAlive;
  }
  return dictionary.staff.detail.correctionStatuses.confirmedDeceased;
}
