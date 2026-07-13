"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  createStaffCaseAction,
  getCurrentStaffSession,
  getStaffCaseDetail,
  getStaffPublishQueue,
  listStaffCaseAudit,
  logoutStaffSession,
  publishStaffCaseUpdate,
  relateStaffCase,
} from "@/lib/api";
import {
  type AuditLogEntryResponse,
  type CaseStatus,
  type CurrentStaffSession,
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

type PublicPublishStage = "pending" | "in_progress" | "resolved";
type ResolvedOutcome =
  | "safe_confirmed"
  | "deceased_confirmed"
  | "assisted_resolved"
  | "duplicate_merged"
  | "custom";

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
  const [isSubmittingStatus, setIsSubmittingStatus] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [publishStage, setPublishStage] = useState<PublicPublishStage>("pending");
  const [resolvedOutcome, setResolvedOutcome] = useState<ResolvedOutcome>("safe_confirmed");
  const [publicUpdateDraft, setPublicUpdateDraft] = useState("");
  const [isLinkingRelation, setIsLinkingRelation] = useState(false);

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
      setPublishStage(getPublicPublishStage(caseDetail.status));
      setResolvedOutcome(getResolvedOutcome(caseDetail.latest_public_update));
      setPublicUpdateDraft(caseDetail.latest_public_update ?? "");
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
      router.replace(buildStaffLoginHref(locale, "logged_out"));
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

  async function handleStatusSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (state.status !== "ready") {
      return;
    }

    setActionError(null);
    setActionSuccess(null);
    if (publicUpdateDraft.trim().length < 5) {
      setActionError(dictionary.staff.detail.publicUpdateRequired);
      return;
    }
    setIsSubmittingStatus(true);

    try {
      await withStaffAuthorization(state.accessToken, (token) =>
        publishStaffCaseUpdate(token, caseId, {
          to_status: mapPublishStageToCaseStatus(publishStage),
          latest_public_update: publicUpdateDraft.trim(),
        }),
      );
      setActionSuccess(dictionary.staff.detail.publishSuccess);
      await loadCase();
    } catch (error) {
      await handleActionError(error);
    } finally {
      setIsSubmittingStatus(false);
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
        createStaffCaseAction(token, caseId, {
          action_type: "claim",
        }),
      );
      setActionSuccess(dictionary.staff.detail.claimSuccess);
      await loadCase();
    } catch (error) {
      await handleActionError(error);
    } finally {
      setIsClaiming(false);
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

  if (state.status === "not-found") {
    return (
      <AppShell
        homeLabel={dictionary.staff.login.backHome}
        languageLabel={dictionary.home.languagePicker}
        locale={locale}
        publicBoardLabel={dictionary.home.boardCta}
        sectionLabel={dictionary.staff.eyebrow}
      >
        <h1 className="headline">{dictionary.staff.detail.notFoundTitle}</h1>
        <p className="lede">{dictionary.staff.detail.notFoundBody}</p>
        <div className="button-row">
          <Link className="button-primary" href={`/${locale}/staff`}>
            {dictionary.staff.detail.backToList}
          </Link>
        </div>
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
  const publishStageOptions: PublicPublishStage[] = ["pending", "in_progress", "resolved"];
  const resolvedOutcomeOptions: ResolvedOutcome[] = [
    "safe_confirmed",
    "deceased_confirmed",
    "assisted_resolved",
    "duplicate_merged",
    "custom",
  ];
  const relatedMarkers = auditEntries
    .map((entry) => getRelatedMarker(entry))
    .filter((marker): marker is RelatedMarker => marker !== null);
  const reviewSummaryItems = [
    { label: dictionary.staff.detail.statusLabel, value: dictionary.caseStatus.labels[caseDetail.status] },
    { label: dictionary.staff.detail.assignedLabel, value: assignedEmail },
    { label: dictionary.staff.detail.urgencyLabel, value: dictionary.home.form.urgency.options[caseDetail.urgency] },
    { label: dictionary.staff.detail.updatedAtLabel, value: dateFormatter.format(new Date(caseDetail.updated_at)) },
  ];
  const recentAuditEntries = [...auditEntries].filter(isUsefulAuditEntry).reverse().slice(0, 5);
  const suggestedMatches = findSuggestedCaseMatches(caseDetail, queue.events.flatMap((event) => event.related_cases));
  const latestPublishedEntry = [...auditEntries].reverse().find(isPublishAuditEntry);
  const hasPublishedUpdate = Boolean(caseDetail.latest_public_update?.trim());

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
      <div>
        <div className="staff-toolbar">
          <div>
            <h1 className="headline headline-compact staff-headline">{dictionary.staff.detail.title}</h1>
            <p className="lede emergency-lede">{dictionary.staff.detail.description}</p>
          </div>
        </div>

        <div className="button-row">
          <Link className="button-secondary" href={`/${locale}/staff`}>
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
                  <span className={getStatusPillClassName(caseDetail.status)}>
                    {dictionary.caseStatus.labels[caseDetail.status]}
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

              <form className="detail-card form-stack staff-action-card" onSubmit={handleStatusSubmit}>
                <div>
                  <h3 className="section-title staff-action-title">{dictionary.staff.detail.statusPanelTitle}</h3>
                  <p className="field-hint compact-copy">{dictionary.staff.detail.publicUpdateScope}</p>
                </div>
                <section
                  className={hasPublishedUpdate ? "published-update-card" : "published-update-card published-update-card-empty"}
                  aria-labelledby="published-update-title"
                >
                  <div className="staff-section-heading">
                    <div>
                      <h4 className="staff-subtitle" id="published-update-title">
                        {dictionary.staff.detail.publishedUpdateTitle}
                      </h4>
                      <p className="field-hint compact-copy">
                        {latestPublishedEntry
                          ? `${dictionary.staff.detail.publishedAtLabel} ${dateFormatter.format(new Date(latestPublishedEntry.created_at))}`
                          : dictionary.staff.detail.notPublishedYet}
                      </p>
                    </div>
                    {hasPublishedUpdate ? (
                      <span className="status-pill">{dictionary.staff.detail.publishedStateLabel}</span>
                    ) : null}
                  </div>
                  <p className="staff-narrative-text">
                    {hasPublishedUpdate ? caseDetail.latest_public_update : dictionary.staff.detail.latestUpdateFallback}
                  </p>
                </section>
                <label className="field">
                  <span className="field-label">{dictionary.staff.detail.statusChangeLabel}</span>
                  <select
                    className="field-control"
                    value={publishStage}
                    onChange={(event) => setPublishStage(event.target.value as PublicPublishStage)}
                  >
                    {publishStageOptions.map((stage) => (
                      <option key={stage} value={stage}>
                        {dictionary.staff.detail.publicStages[stage]}
                      </option>
                    ))}
                  </select>
                </label>
                {publishStage === "resolved" ? (
                  <label className="field">
                    <span className="field-label">{dictionary.staff.detail.resolvedOutcomeLabel}</span>
                    <select
                      className="field-control"
                      value={resolvedOutcome}
                      onChange={(event) => {
                        const nextOutcome = event.target.value as ResolvedOutcome;
                        setResolvedOutcome(nextOutcome);
                        const template = getResolvedOutcomeTemplate(dictionary, nextOutcome);
                        if (template) {
                          setPublicUpdateDraft(template);
                        }
                      }}
                    >
                      {resolvedOutcomeOptions.map((outcome) => (
                        <option key={outcome} value={outcome}>
                          {dictionary.staff.detail.resolvedOutcomes[outcome]}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <div className="info-banner" role="status">
                  {dictionary.staff.detail.publishStageDescriptions[publishStage]}
                </div>
                {publishStage === "resolved" ? (
                  <div className="button-row">
                    {resolvedOutcomeOptions
                      .filter((outcome) => outcome !== "custom")
                      .map((outcome) => (
                        <button
                          key={outcome}
                          className="button-secondary"
                          type="button"
                          onClick={() => {
                            setResolvedOutcome(outcome);
                            setPublicUpdateDraft(getResolvedOutcomeTemplate(dictionary, outcome));
                          }}
                        >
                          {dictionary.staff.detail.resolvedOutcomes[outcome]}
                        </button>
                      ))}
                  </div>
                ) : null}
                <label className="field">
                  <span className="field-label">
                    {hasPublishedUpdate
                      ? dictionary.staff.detail.publicUpdateEditLabel
                      : dictionary.staff.detail.publicUpdateLabel}
                  </span>
                  <span className="field-hint">{dictionary.staff.detail.publicUpdateHint}</span>
                  <textarea
                    className="field-control field-textarea"
                    maxLength={4000}
                    rows={4}
                    value={publicUpdateDraft}
                    onChange={(event) => {
                      setResolvedOutcome("custom");
                      setPublicUpdateDraft(event.target.value);
                    }}
                  />
                </label>
                <button className="button-primary" disabled={isSubmittingStatus} type="submit">
                  {isSubmittingStatus
                    ? dictionary.staff.detail.submitting
                    : hasPublishedUpdate
                      ? dictionary.staff.detail.statusEditSubmit
                      : dictionary.staff.detail.statusSubmit}
                </button>
              </form>
            </section>

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
                        <Link className="button-secondary" href={`/${locale}/staff/cases/${match.case.id}`}>
                          {dictionary.staff.detail.openSuggestedCase}
                        </Link>
                        <button
                          className="button-secondary"
                          disabled={isLinkingRelation}
                          type="button"
                          onClick={() => void handleRelation(match.case, "possible_duplicate")}
                        >
                          {dictionary.staff.detail.markPossibleDuplicate}
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
  router.replace(buildStaffLoginHref(locale, reason));
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
  if (metadata.action_type === "status_change") {
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
    actionType === "claim"
  );
}

function isPublishAuditEntry(entry: AuditLogEntryResponse) {
  return entry.metadata_json?.action_type === "publish_update";
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

function getStatusPillClassName(status: CaseStatus) {
  if (status === "pending_review" || status === "waiting_for_information") {
    return "status-pill status-pill-warning";
  }

  if (status === "safe_resolved" || status === "closed") {
    return "status-pill status-pill-neutral";
  }

  return "status-pill";
}

function getPublicPublishStage(status: CaseStatus): PublicPublishStage {
  if (status === "safe_resolved" || status === "closed") {
    return "resolved";
  }

  if (status === "active") {
    return "in_progress";
  }

  return "pending";
}

function mapPublishStageToCaseStatus(stage: PublicPublishStage): CaseStatus {
  if (stage === "resolved") {
    return "safe_resolved";
  }

  if (stage === "in_progress") {
    return "active";
  }

  return "pending_review";
}

function getResolvedOutcome(update: string | null): ResolvedOutcome {
  if (!update) {
    return "safe_confirmed";
  }

  const normalized = update.toLowerCase();
  if (
    normalized.includes("duplicate") ||
    normalized.includes("merged") ||
    update.includes("重复") ||
    update.includes("合并")
  ) {
    return "duplicate_merged";
  }

  if (
    normalized.includes("deceased") ||
    normalized.includes("passed away") ||
    update.includes("去世") ||
    update.includes("死亡")
  ) {
    return "deceased_confirmed";
  }

  if (
    normalized.includes("rescued") ||
    normalized.includes("assisted") ||
    normalized.includes("help delivered") ||
    update.includes("救助") ||
    update.includes("获救")
  ) {
    return "assisted_resolved";
  }

  if (
    normalized.includes("safe") ||
    normalized.includes("accounted") ||
    update.includes("平安") ||
    update.includes("安全")
  ) {
    return "safe_confirmed";
  }

  return "custom";
}

function getResolvedOutcomeTemplate(dictionary: Dictionary, outcome: ResolvedOutcome) {
  if (outcome === "custom") {
    return "";
  }

  return dictionary.staff.detail.resolvedOutcomeTemplates[outcome];
}
