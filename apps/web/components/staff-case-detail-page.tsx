"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { findSuggestedCaseMatches, type SuggestedCaseMatch } from "@/lib/staff-case-matches";

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
  const canResolve =
    (isAssignedToCurrentUser || session.user.role === "coordinator") &&
    Boolean(caseDetail.assigned_staff_user) &&
    !isFinal;
  const currentOperationalStatusLabel = operationalStatusLabel(
    dictionary,
    caseOperationalStatus,
    caseDetail.subject_type,
  );
  const reviewSummaryItems = [
    { label: dictionary.staff.detail.statusLabel, value: currentOperationalStatusLabel },
    { label: dictionary.staff.detail.assignedLabel, value: assignedEmail },
    { label: dictionary.staff.detail.urgencyLabel, value: dictionary.home.form.urgency.options[caseDetail.urgency] },
    { label: dictionary.staff.detail.updatedAtLabel, value: dateFormatter.format(new Date(caseDetail.updated_at)) },
  ];
  const recentAuditEntries = [...auditEntries].filter(isUsefulAuditEntry).reverse().slice(0, 5);
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
        <div className="staff-toolbar">
          <div>
            <div className="staff-detail-title-row">
              <h1 className="headline headline-compact staff-headline">{dictionary.staff.detail.title}</h1>
              <span className={getOperationalStatusClassName(caseOperationalStatus)}>
                {currentOperationalStatusLabel}
              </span>
            </div>
            <p className="lede emergency-lede">{dictionary.staff.detail.description}</p>
          </div>
        </div>

        <div className="button-row">
          <Link className="button-secondary" href="/staff">
            {dictionary.staff.detail.backToList}
          </Link>
        </div>

        <section className="staff-review-shell" aria-labelledby="staff-review-title">
          <div className="staff-review-main">
            <section className="detail-card staff-review-hero" aria-labelledby="staff-review-title">
              <div className="staff-review-hero-header">
                <div>
                  <span className="status-pill status-pill-neutral">{caseDetail.case_code}</span>
                  <h2 className="section-title staff-case-title" id="staff-review-title">
                    {locationSummary}
                  </h2>
                  <p className="field-hint compact-copy">
                    {assignedEmail} · {session.user.email}
                  </p>
                </div>
                <div className={getUrgencyPillClassName(caseDetail.urgency)}>
                  {dictionary.home.form.urgency.options[caseDetail.urgency]}
                </div>
              </div>

              <dl className="detail-grid">
                {reviewSummaryItems.map((item) => (
                  <div className="detail-card" key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>

              <div className="staff-narrative-grid">
                <article className="detail-card detail-card-plain">
                  <h3 className="section-title staff-action-title">{dictionary.staff.detail.needsTitle}</h3>
                  <p className="staff-narrative-text">{needsSummary}</p>
                </article>
                <article className="detail-card detail-card-plain">
                  <h3 className="section-title staff-action-title">{dictionary.staff.detail.latestUpdateLabel}</h3>
                  <p className="staff-narrative-text">{latestUpdate}</p>
                </article>
              </div>
            </section>

            <section className="staff-review-panel" aria-labelledby="staff-actions-title">
              <div className="staff-section-heading">
                <div>
                  <h2 className="section-title" id="staff-actions-title">
                    {dictionary.staff.detail.actionsTitle}
                  </h2>
                </div>
                <div className="staff-inline-status">
                  <span className={getOperationalStatusClassName(caseOperationalStatus)}>
                    {currentOperationalStatusLabel}
                  </span>
                </div>
              </div>

              {actionError ? (
                <p className="error-banner" role="alert">
                  {actionError}
                </p>
              ) : null}
              {actionSuccess ? (
                <p className="info-banner" role="status">
                  {actionSuccess}
                </p>
              ) : null}

              <div className="detail-card form-stack staff-action-card">
                <h3 className="section-title staff-action-title">{dictionary.staff.detail.nextActionTitle}</h3>
                <div className="button-row staff-primary-actions">
                  {canClaim || canCoordinatorReassign ? (
                    <button
                      className="button-primary"
                      disabled={isClaiming}
                      type="button"
                      onClick={() => void handleClaim()}
                    >
                      {canCoordinatorReassign
                        ? dictionary.staff.detail.reassignToMeAction
                        : dictionary.staff.detail.claimSubmit}
                    </button>
                  ) : null}
                  {canResolve ? (
                    <>
                      <button
                        className="button-primary"
                        disabled={isSubmittingOutcome}
                        type="button"
                        onClick={() => void handleOutcome("safe")}
                      >
                        {dictionary.staff.detail.foundSafeAction}
                      </button>
                      <button
                        className="button-secondary"
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
                      <button
                        className="button-secondary"
                        disabled={isSubmittingOutcome}
                        type="button"
                        onClick={() => void handleOutcome("return")}
                      >
                        {dictionary.staff.detail.returnAction}
                      </button>
                    </>
                  ) : null}
                  {isFinal ? (
                    <button
                      className="button-primary"
                      type="button"
                      onClick={() => {
                        setCorrectionTarget(caseOperationalStatus);
                        setCorrectionNote("");
                        setIsCorrectionOpen(true);
                      }}
                    >
                      {dictionary.staff.detail.correctStatusAction}
                    </button>
                  ) : null}
                  {!canClaim && !canCoordinatorReassign && !canResolve ? (
                    isFinal ? null : (
                      <p className="field-hint compact-copy">{dictionary.staff.detail.noPrimaryAction}</p>
                    )
                  ) : null}
                </div>
                {isCorrectionOpen ? (
                  <form
                    aria-labelledby="staff-status-correction-title"
                    className="status-correction-dialog form-stack"
                    role="dialog"
                    onSubmit={(event) => void handleStatusCorrection(event)}
                  >
                    <h4 className="section-title staff-action-title" id="staff-status-correction-title">
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
                    <div className="button-row">
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
                    <article className="detail-card staff-duplicate-card" key={match.case.id}>
                      <div>
                        <p className="field-hint compact-copy">{match.case.case_code}</p>
                        <h3 className="section-title staff-action-title">{match.case.location_summary}</h3>
                        <p className="support-copy compact-copy">{match.case.needs_summary}</p>
                        <p className="field-hint staff-match-reasons">
                          {getMatchReasonLabel(dictionary, match)}
                        </p>
                      </div>
                      <div className="button-row">
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
                          className="button-primary"
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

            <section className="staff-review-panel" aria-labelledby="staff-audit-title">
              <div className="staff-section-heading">
                <div>
                  <h2 className="section-title" id="staff-audit-title">
                    {dictionary.staff.detail.auditTitle}
                  </h2>
                </div>
              </div>

              {recentAuditEntries.length === 0 ? (
                <p className="support-copy">{dictionary.staff.detail.auditEmpty}</p>
              ) : (
                <ol className="staff-audit-list">
                  {recentAuditEntries.map((entry) => (
                    <li className="detail-card" key={entry.id}>
                      <div className="staff-audit-row">
                        <strong>{getAuditEntryTitle(dictionary, entry)}</strong>
                        <span>{dateFormatter.format(new Date(entry.created_at))}</span>
                      </div>
                      <p className="support-copy">{getAuditEntryDescription(dictionary, entry)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
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

function getMatchReasonLabel(dictionary: Dictionary, match: SuggestedCaseMatch) {
  const reasons = match.reasons.map((reason) => dictionary.staff.detail.matchReasons[reason]);
  return reasons.join(" · ");
}

function getAuditEntryTitle(dictionary: Dictionary, entry: AuditLogEntryResponse) {
  const metadata = entry.metadata_json ?? {};
  if (metadata.action_type === "publish_update") {
    return dictionary.staff.detail.auditEvents.published;
  }
  if (metadata.action_type === "relation_marked") {
    return metadata.relation_type === "confirmed_duplicate"
      ? dictionary.staff.detail.auditEvents.duplicateConfirmed
      : dictionary.staff.detail.auditEvents.relationMarked;
  }
  if (metadata.action_type === "note") {
    return dictionary.staff.detail.auditEvents.noteAdded;
  }
  if (metadata.action_type === "status_change" || metadata.action_type === "operational_status_correction") {
    return dictionary.staff.detail.auditEvents.statusChanged;
  }
  if (metadata.action_type === "claim") {
    return dictionary.staff.detail.auditEvents.claimed;
  }
  if (entry.event_type === "case_submitted") {
    return dictionary.staff.detail.auditEvents.reportReceived;
  }
  return dictionary.staff.detail.auditEvents.systemActivity;
}

function isUsefulAuditEntry(entry: AuditLogEntryResponse) {
  if (entry.event_type === "case_submitted") {
    return true;
  }

  const actionType = entry.metadata_json?.action_type;
  return (
    actionType === "publish_update" ||
    actionType === "relation_marked" ||
    actionType === "note" ||
    actionType === "status_change" ||
    actionType === "operational_status_correction" ||
    actionType === "claim"
  );
}

function getAuditEntryDescription(dictionary: Dictionary, entry: AuditLogEntryResponse) {
  const metadata = entry.metadata_json ?? {};
  if (metadata.action_type === "publish_update" && typeof metadata.latest_public_update === "string") {
    return metadata.latest_public_update;
  }
  if (metadata.action_type === "relation_marked" && typeof metadata.related_case_id === "number") {
    return `${getRelationTypeLabel(dictionary, metadata.relation_type as StaffCaseRelationType)} · #${metadata.related_case_id}`;
  }
  if (typeof metadata.note === "string" && metadata.note.trim()) {
    return metadata.note;
  }
  if (
    metadata.action_type === "operational_status_correction" &&
    typeof metadata.from_operational_status === "string" &&
    typeof metadata.to_operational_status === "string"
  ) {
    const fromLabel = correctionStatusLabel(dictionary, metadata.from_operational_status as OperationalStatus);
    const toLabel = correctionStatusLabel(dictionary, metadata.to_operational_status as OperationalStatus);
    return `${fromLabel} -> ${toLabel}`;
  }
  if (metadata.action_type === "status_change" && typeof metadata.to_status === "string") {
    const status = metadata.to_status as CaseStatus;
    return status in dictionary.caseStatus.labels
      ? dictionary.caseStatus.labels[status]
      : dictionary.staff.detail.auditEvents.noDetail;
  }
  return dictionary.staff.detail.auditEvents.noDetail;
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

function getUrgencyPillClassName(urgency: StaffCaseDetailResponse["urgency"]) {
  if (urgency === "critical" || urgency === "high") {
    return "status-pill status-pill-alert";
  }

  if (urgency === "medium") {
    return "status-pill status-pill-warning";
  }

  return "status-pill";
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

function getOperationalStatusClassName(status: OperationalStatus) {
  if (status === "unassigned") {
    return "status-pill status-pill-warning";
  }
  if (status === "in_progress") {
    return "status-pill status-pill-alert";
  }
  return "status-pill";
}
