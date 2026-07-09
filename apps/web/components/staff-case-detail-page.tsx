"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  createStaffCaseAction,
  getCurrentStaffSession,
  getStaffCaseIntakeReview,
  getStaffCaseDetail,
  getStaffCaseVoice,
  listStaffCaseAudit,
  logoutStaffSession,
  publishStaffCaseUpdate,
  relateStaffCase,
} from "@/lib/api";
import {
  caseStatuses,
  type AuditLogEntryResponse,
  type CaseStatus,
  type CurrentStaffSession,
  type StaffCaseIntakeReviewResponse,
  type StaffCaseDetailResponse,
  type StaffCaseRelationType,
  type StaffCaseVoiceResponse,
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
import { buildAiDraft } from "@/lib/staff-intake-review";
import { LanguageSwitcher } from "@/components/language-switcher";

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
  const [nextStatus, setNextStatus] = useState<CaseStatus>(caseStatuses[0]);
  const [publicUpdateDraft, setPublicUpdateDraft] = useState("");
  const [isLinkingRelation, setIsLinkingRelation] = useState(false);
  const [relatedCaseIdDraft, setRelatedCaseIdDraft] = useState("");
  const [relationTypeDraft, setRelationTypeDraft] = useState<StaffCaseRelationType>("related_update");
  const [relationNoteDraft, setRelationNoteDraft] = useState("");
  const noteFieldRef = useRef<HTMLTextAreaElement | null>(null);
  const requestSequenceRef = useRef(0);
  const [voiceDetail, setVoiceDetail] = useState<StaffCaseVoiceResponse | null>(null);
  const [isVoiceLoading, setIsVoiceLoading] = useState(false);
  const [intakeReview, setIntakeReview] = useState<StaffCaseIntakeReviewResponse | null>(null);
  const [isIntakeReviewLoading, setIsIntakeReviewLoading] = useState(false);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    [locale],
  );

  const loadSupplementalCaseData = useCallback(
    async (accessToken: string, requestSequence: number) => {
      const guard = (callback: () => void) => {
        if (requestSequence === requestSequenceRef.current) {
          callback();
        }
      };

      void loadOptionalVoiceDetail(accessToken, caseId)
        .then((nextVoiceDetail) => {
          guard(() => setVoiceDetail(nextVoiceDetail));
        })
        .catch((error: unknown) => {
          if (error instanceof MissingStaffSessionError) {
            guard(() => redirectToLogin(router, locale, "missing"));
            return;
          }
          if (error instanceof UnauthorizedStaffSessionError) {
            guard(() => redirectToLogin(router, locale, error.reason));
            return;
          }
          guard(() => setVoiceDetail(null));
        })
        .finally(() => {
          guard(() => setIsVoiceLoading(false));
        });

      void loadOptionalIntakeReview(accessToken, caseId)
        .then((nextIntakeReview) => {
          guard(() => setIntakeReview(nextIntakeReview));
        })
        .catch((error: unknown) => {
          if (error instanceof MissingStaffSessionError) {
            guard(() => redirectToLogin(router, locale, "missing"));
            return;
          }
          if (error instanceof UnauthorizedStaffSessionError) {
            guard(() => redirectToLogin(router, locale, error.reason));
            return;
          }
          guard(() => setIntakeReview(null));
        })
        .finally(() => {
          guard(() => setIsIntakeReviewLoading(false));
        });
    },
    [caseId, locale, router],
  );

  const loadCase = useCallback(async () => {
    const accessToken = readStoredStaffAccessToken();
    const requestSequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestSequence;

    try {
      const token = accessToken;
      if (!token) {
        throw new MissingStaffSessionError();
      }

      const session = await withStaffAuthorization(token, getCurrentStaffSession);
      const [caseDetail, auditEntries] = await Promise.all([
        withStaffAuthorization(token, (staffAccessToken) => getStaffCaseDetail(staffAccessToken, caseId)),
        withStaffAuthorization(token, (staffAccessToken) => listStaffCaseAudit(staffAccessToken, caseId)),
      ]);

      setState({
        status: "ready",
        accessToken: token,
        session,
        caseDetail,
        auditEntries,
      });
      setNextStatus(caseDetail.status);
      setPublicUpdateDraft(caseDetail.latest_public_update ?? "");
      setVoiceDetail(null);
      setIntakeReview(null);
      setIsVoiceLoading(true);
      setIsIntakeReviewLoading(true);
      void loadSupplementalCaseData(token, requestSequence);
    } catch (error) {
      if (requestSequenceRef.current !== requestSequence) {
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
    loadSupplementalCaseData,
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
          to_status: nextStatus,
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

  async function handleRelationSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (state.status !== "ready") {
      return;
    }

    const relatedCaseId = Number.parseInt(relatedCaseIdDraft, 10);
    setActionError(null);
    setActionSuccess(null);

    if (!Number.isInteger(relatedCaseId) || relatedCaseId <= 0) {
      setActionError(dictionary.staff.detail.relatedCaseRequired);
      return;
    }

    setIsLinkingRelation(true);

    try {
      await withStaffAuthorization(state.accessToken, (token) =>
        relateStaffCase(token, caseId, {
          related_case_id: relatedCaseId,
          relation_type: relationTypeDraft,
          note: relationNoteDraft.trim() || null,
        }),
      );
      setRelatedCaseIdDraft("");
      setRelationNoteDraft("");
      setRelationTypeDraft("related_update");
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

  function handleApplyAiDraft() {
    if (state.status !== "ready" || !intakeReview || intakeReview.status !== "ready") {
      return;
    }

    const aiDraft = buildAiDraft(intakeReview);
    setNote((current) => (current.trim() ? `${current.trim()}\n\n${aiDraft}` : aiDraft));
    setNoteError(null);
    setActionError(null);
    setActionSuccess(dictionary.staff.detail.aiReview.draftReady);
    noteFieldRef.current?.focus();
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

  if (state.status === "not-found") {
    return (
      <main className="page-shell">
        <div className="page-card">
          <span className="eyebrow">{dictionary.staff.eyebrow}</span>
          <h1 className="headline">{dictionary.staff.detail.notFoundTitle}</h1>
          <p className="lede">{dictionary.staff.detail.notFoundBody}</p>
          <div className="button-row">
            <Link className="button-primary" href={`/${locale}/staff`}>
              {dictionary.staff.detail.backToList}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main className="page-shell">
        <div className="page-card">
          <span className="eyebrow">{dictionary.staff.eyebrow}</span>
          <h1 className="headline">{dictionary.staff.detail.title}</h1>
          <p className="error-banner" role="alert">
            {state.message}
          </p>
          <div className="button-row">
            <button className="button-primary" type="button" onClick={() => void loadCase()}>
              {dictionary.staff.detail.retry}
            </button>
          </div>
        </div>
      </main>
    );
  }

  const { caseDetail, auditEntries, session } = state;
  const assignedEmail = caseDetail.assigned_staff_user?.email ?? dictionary.staff.detail.unassigned;
  const locationSummary = caseDetail.location_summary.trim() || dictionary.staff.detail.summaryFallback;
  const needsSummary = caseDetail.needs_summary.trim() || dictionary.staff.detail.summaryFallback;
  const latestUpdate = caseDetail.latest_public_update ?? dictionary.staff.detail.latestUpdateFallback;
  const eventAssociationItems = [
    dictionary.staff.detail.eventAssociationItems.timeline,
    dictionary.staff.detail.eventAssociationItems.signals,
    dictionary.staff.detail.eventAssociationItems.crossCase,
  ];
  const relatedMarkers = auditEntries
    .map((entry) => getRelatedMarker(entry))
    .filter((marker): marker is RelatedMarker => marker !== null);
  const officialDataItems = [
    buildReviewChecklistItem(
      dictionary.staff.detail.officialDataItems.assignment,
      dictionary.staff.detail.officialDataDescriptions.assignment,
      caseDetail.assigned_staff_user ? "confirmed" : "pending",
      caseDetail.assigned_staff_user ? dictionary.staff.detail.confirmedState : dictionary.staff.detail.pendingState,
    ),
    buildReviewChecklistItem(
      dictionary.staff.detail.officialDataItems.contact,
      dictionary.staff.detail.officialDataDescriptions.contact,
      hasContactDetail(caseDetail) ? "review" : "pending",
      hasContactDetail(caseDetail) ? dictionary.staff.detail.reviewNeededState : dictionary.staff.detail.pendingState,
    ),
    buildReviewChecklistItem(
      dictionary.staff.detail.officialDataItems.status,
      dictionary.staff.detail.officialDataDescriptions.status,
      getStatusReviewState(caseDetail.status),
      getStatusReviewStateLabel(dictionary, caseDetail.status),
    ),
  ];
  const reviewSummaryItems = [
    { label: dictionary.staff.detail.statusLabel, value: dictionary.caseStatus.labels[caseDetail.status] },
    { label: dictionary.staff.detail.assignedLabel, value: assignedEmail },
    { label: dictionary.staff.detail.viewerLabel, value: session.user.email },
    { label: dictionary.staff.detail.urgencyLabel, value: dictionary.home.form.urgency.options[caseDetail.urgency] },
    {
      label: dictionary.staff.detail.incidentTypeLabel,
      value: dictionary.home.form.incidentType.options[caseDetail.incident_type],
    },
    { label: dictionary.staff.detail.languageLabel, value: caseDetail.language_code },
  ];
  const caseContextItems = [
    { label: dictionary.staff.detail.caseCodeLabel, value: caseDetail.case_code },
    { label: dictionary.staff.detail.createdAtLabel, value: dateFormatter.format(new Date(caseDetail.created_at)) },
    { label: dictionary.staff.detail.updatedAtLabel, value: dateFormatter.format(new Date(caseDetail.updated_at)) },
    { label: dictionary.staff.detail.latestUpdateLabel, value: latestUpdate, wide: true },
  ];
  const reporterItems = [
    {
      label: dictionary.staff.detail.reporterNameLabel,
      value: caseDetail.reporter_name ?? dictionary.staff.detail.contactFallback,
    },
    {
      label: dictionary.staff.detail.reporterEmailLabel,
      value: caseDetail.reporter_email ?? dictionary.staff.detail.contactFallback,
    },
    {
      label: dictionary.staff.detail.reporterPhoneLabel,
      value: caseDetail.reporter_phone ?? dictionary.staff.detail.contactFallback,
    },
  ];

  return (
    <main className="page-shell">
      <div className="page-card page-card-wide">
        <div className="staff-toolbar">
          <div>
            <span className="eyebrow">{dictionary.staff.eyebrow}</span>
            <h1 className="headline staff-headline">{dictionary.staff.detail.title}</h1>
            <p className="lede">{dictionary.staff.detail.description}</p>
          </div>
          <div className="staff-toolbar-actions">
            <LanguageSwitcher currentLocale={locale} label={dictionary.home.languagePicker} />
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
                    {dictionary.staff.detail.reviewWorkspaceTitle}
                  </h2>
                  <p className="support-copy staff-review-copy">
                    {dictionary.staff.detail.reviewWorkspaceDescription}
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
                  <h3 className="section-title staff-action-title">{dictionary.staff.detail.locationTitle}</h3>
                  <p className="staff-narrative-text">{locationSummary}</p>
                </article>
                <article className="detail-card detail-card-plain">
                  <h3 className="section-title staff-action-title">{dictionary.staff.detail.needsTitle}</h3>
                  <p className="staff-narrative-text">{needsSummary}</p>
                </article>
              </div>
            </section>

            <section className="staff-review-panel" aria-labelledby="staff-actions-title">
              <div className="staff-section-heading">
                <div>
                  <h2 className="section-title" id="staff-actions-title">
                    {dictionary.staff.detail.actionsTitle}
                  </h2>
                  <p className="support-copy">{dictionary.staff.detail.actionsDescription}</p>
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

              <div className="staff-action-grid">
                <form className="detail-card form-stack staff-action-card" noValidate onSubmit={handleNoteSubmit}>
                  <div>
                    <h3 className="section-title staff-action-title">{dictionary.staff.detail.noteTitle}</h3>
                    <p className="field-hint">{dictionary.staff.detail.noteHint}</p>
                  </div>
                  <label className="field">
                    <span className="field-label">{dictionary.staff.detail.noteLabel}</span>
                    <textarea
                      ref={noteFieldRef}
                      className="field-control field-textarea"
                      maxLength={4000}
                      rows={5}
                      value={note}
                      onChange={(event) => {
                        setNote(event.target.value);
                        if (noteError) {
                          setNoteError(null);
                        }
                      }}
                    />
                    <span className="field-hint">{dictionary.staff.detail.notePrompt}</span>
                    {noteError ? <span className="field-error">{noteError}</span> : null}
                  </label>
                  <button className="button-primary" disabled={isSubmittingNote} type="submit">
                    {isSubmittingNote ? dictionary.staff.detail.submitting : dictionary.staff.detail.noteSubmit}
                  </button>
                </form>

                <form className="detail-card form-stack staff-action-card" onSubmit={handleStatusSubmit}>
                  <div>
                    <h3 className="section-title staff-action-title">{dictionary.staff.detail.statusPanelTitle}</h3>
                    <p className="field-hint">{dictionary.staff.detail.statusChangeHint}</p>
                  </div>
                  <label className="field">
                    <span className="field-label">{dictionary.staff.detail.statusChangeLabel}</span>
                    <select
                      className="field-control"
                      value={nextStatus}
                      onChange={(event) => setNextStatus(event.target.value as (typeof caseStatuses)[number])}
                    >
                      {caseStatuses.map((status) => (
                        <option key={status} value={status}>
                          {dictionary.caseStatus.labels[status]}
                        </option>
                      ))}
                    </select>
                    <span className="field-hint">{dictionary.staff.detail.statusPrompt}</span>
                  </label>
                  <label className="field">
                    <span className="field-label">{dictionary.staff.detail.publicUpdateLabel}</span>
                    <textarea
                      className="field-control field-textarea"
                      maxLength={4000}
                      rows={4}
                      value={publicUpdateDraft}
                      onChange={(event) => setPublicUpdateDraft(event.target.value)}
                    />
                    <span className="field-hint">{dictionary.staff.detail.publicUpdateHint}</span>
                  </label>
                  <button className="button-primary" disabled={isSubmittingStatus} type="submit">
                    {isSubmittingStatus ? dictionary.staff.detail.submitting : dictionary.staff.detail.statusSubmit}
                  </button>
                </form>

                <div className="detail-card form-stack staff-action-card">
                  <div>
                    <h3 className="section-title staff-action-title">{dictionary.staff.detail.claimTitle}</h3>
                    <p className="field-hint">{dictionary.staff.detail.claimHint}</p>
                  </div>
                  <dl className="staff-mini-facts">
                    <div>
                      <dt>{dictionary.staff.detail.assignedLabel}</dt>
                      <dd>{assignedEmail}</dd>
                    </div>
                    <div>
                      <dt>{dictionary.staff.detail.viewerLabel}</dt>
                      <dd>{session.user.email}</dd>
                    </div>
                  </dl>
                  <button className="button-secondary" disabled={isClaiming} type="button" onClick={handleClaim}>
                    {isClaiming ? dictionary.staff.detail.submitting : dictionary.staff.detail.claimSubmit}
                  </button>
                </div>
              </div>
            </section>

            <section className="staff-review-panel" aria-labelledby="staff-official-data-title">
              <div className="staff-section-heading">
                <div>
                  <h2 className="section-title" id="staff-official-data-title">
                    {dictionary.staff.detail.officialDataTitle}
                  </h2>
                  <p className="support-copy">{dictionary.staff.detail.officialDataDescription}</p>
                </div>
              </div>
              <div className="staff-checklist-grid">
                {officialDataItems.map((item) => (
                  <article className="detail-card detail-card-plain" key={item.title}>
                    <div className="staff-chip-row">
                      <h3 className="section-title staff-action-title">{item.title}</h3>
                      <span className={item.pillClassName}>{item.state}</span>
                    </div>
                    <p className="support-copy">{item.description}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="staff-review-panel" aria-labelledby="staff-audit-title">
              <div className="staff-section-heading">
                <div>
                  <h2 className="section-title" id="staff-audit-title">
                    {dictionary.staff.detail.auditTitle}
                  </h2>
                  <p className="support-copy">{dictionary.staff.detail.auditDescription}</p>
                </div>
              </div>

              {auditEntries.length === 0 ? (
                <p className="support-copy">{dictionary.staff.detail.auditEmpty}</p>
              ) : (
                <ol className="staff-audit-list">
                  {auditEntries.map((entry) => (
                    <li className="detail-card" key={entry.id}>
                      <div className="staff-audit-row">
                        <strong>{entry.event_type}</strong>
                        <span>{dateFormatter.format(new Date(entry.created_at))}</span>
                      </div>
                      <p className="support-copy">
                        {dictionary.staff.detail.actorLabel}: {getActorLabel(dictionary, entry.actor_type)}
                        {entry.actor_user_id ? ` #${entry.actor_user_id}` : ""}
                      </p>
                      {entry.metadata_json ? (
                        <pre className="metadata-block">{JSON.stringify(entry.metadata_json, null, 2)}</pre>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          <aside className="staff-review-sidebar">
            <section className="detail-card staff-sidebar-panel" aria-labelledby="staff-event-title">
              <h2 className="section-title" id="staff-event-title">
                {dictionary.staff.detail.eventAssociationTitle}
              </h2>
              <p className="support-copy">{dictionary.staff.detail.eventAssociationDescription}</p>
              <ul className="staff-checklist">
                {eventAssociationItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <form className="form-stack" onSubmit={handleRelationSubmit}>
                <label className="field">
                  <span className="field-label">{dictionary.staff.detail.relatedCaseLabel}</span>
                  <input
                    className="field-control"
                    inputMode="numeric"
                    min={1}
                    pattern="[0-9]*"
                    type="text"
                    value={relatedCaseIdDraft}
                    onChange={(event) =>
                      setRelatedCaseIdDraft(event.target.value.replaceAll(/[^0-9]/g, ""))
                    }
                  />
                </label>
                <label className="field">
                  <span className="field-label">{dictionary.staff.detail.relationTypeLabel}</span>
                  <select
                    className="field-control"
                    value={relationTypeDraft}
                    onChange={(event) => setRelationTypeDraft(event.target.value as StaffCaseRelationType)}
                  >
                    {(["related_update", "possible_duplicate", "confirmed_duplicate"] as const).map(
                      (relationType) => (
                        <option key={relationType} value={relationType}>
                          {getRelationTypeLabel(dictionary, relationType)}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">{dictionary.staff.detail.relationNoteLabel}</span>
                  <textarea
                    className="field-control field-textarea"
                    maxLength={4000}
                    rows={3}
                    value={relationNoteDraft}
                    onChange={(event) => setRelationNoteDraft(event.target.value)}
                  />
                </label>
                <button className="button-secondary" disabled={isLinkingRelation} type="submit">
                  {isLinkingRelation
                    ? dictionary.staff.detail.submitting
                    : dictionary.staff.detail.relationSubmit}
                </button>
              </form>
              <div>
                <h3 className="section-title staff-action-title">{dictionary.staff.detail.relatedLinksTitle}</h3>
                {relatedMarkers.length > 0 ? (
                  <ol className="staff-review-list">
                    {relatedMarkers.map((marker) => (
                      <li key={`${marker.relatedCaseId}-${marker.createdAt}-${marker.relationType}`}>
                        #{marker.relatedCaseId} · {getRelationTypeLabel(dictionary, marker.relationType)} ·{" "}
                        {dateFormatter.format(new Date(marker.createdAt))}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="support-copy">{dictionary.staff.detail.auditEmpty}</p>
                )}
              </div>
            </section>

            <section className="detail-card staff-sidebar-panel" aria-labelledby="staff-ai-review-title">
              <div className="staff-section-header">
                <div>
                  <h2 className="section-title" id="staff-ai-review-title">
                    {dictionary.staff.detail.aiReview.title}
                  </h2>
                  <p className="support-copy section-copy">{dictionary.staff.detail.aiReview.description}</p>
                </div>
                {intakeReview?.status === "ready" ? (
                  <button className="button-secondary" type="button" onClick={handleApplyAiDraft}>
                    {dictionary.staff.detail.aiReview.applyDraft}
                  </button>
                ) : null}
              </div>

              {intakeReview ? (
                <p className="info-banner" role="status">
                  {intakeReview.disclaimer || dictionary.staff.detail.aiReview.fallbackDisclaimer}
                </p>
              ) : null}

              <div className="detail-grid">
                <div className="detail-card">
                  <dt>{dictionary.staff.detail.aiReview.statusLabel}</dt>
                  <dd>
                    {isIntakeReviewLoading
                      ? dictionary.staff.detail.aiReview.loading
                      : intakeReview?.status === "ready"
                        ? dictionary.staff.detail.aiReview.ready
                        : dictionary.staff.detail.aiReview.unavailable}
                  </dd>
                </div>
                <div className="detail-card detail-card-wide">
                  <dt>{dictionary.staff.detail.aiReview.sourceInputsLabel}</dt>
                  <dd>{intakeReview?.source_inputs.join(", ") || dictionary.staff.detail.voice.notAvailable}</dd>
                </div>
                <div className="detail-card detail-card-wide">
                  <dt>{dictionary.staff.detail.aiReview.sourcePreviewLabel}</dt>
                  <dd>{intakeReview?.source_preview || dictionary.staff.detail.voice.notAvailable}</dd>
                </div>
              </div>

              {isIntakeReviewLoading ? (
                <p className="support-copy">{dictionary.staff.session.loading}</p>
              ) : intakeReview?.status === "ready" &&
                intakeReview.staff_summary_suggestion &&
                intakeReview.suggested_tags ? (
                <div className="staff-review-stack">
                  <div className="detail-card form-stack">
                    <dt>{dictionary.staff.detail.aiReview.summaryTitle}</dt>
                    <dd>{intakeReview.staff_summary_suggestion.headline}</dd>
                    <p className="support-copy">{intakeReview.staff_summary_suggestion.situation_overview}</p>
                    <p className="support-copy">{intakeReview.staff_summary_suggestion.urgency_note}</p>
                    <div>
                      <p className="field-label">{dictionary.staff.detail.aiReview.followUpTitle}</p>
                      {intakeReview.staff_summary_suggestion.recommended_follow_up.length > 0 ? (
                        <ul className="staff-review-list">
                          {intakeReview.staff_summary_suggestion.recommended_follow_up.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="support-copy">{dictionary.staff.detail.aiReview.emptyTagGroup}</p>
                      )}
                    </div>
                  </div>

                  <div className="detail-card form-stack">
                    <dt>{dictionary.staff.detail.aiReview.tagsTitle}</dt>
                    <TagGroup
                      label={dictionary.staff.detail.aiReview.urgencyTagsLabel}
                      values={intakeReview.suggested_tags.urgency_cues}
                      emptyLabel={dictionary.staff.detail.aiReview.emptyTagGroup}
                    />
                    <TagGroup
                      label={dictionary.staff.detail.aiReview.missingPersonTagsLabel}
                      values={intakeReview.suggested_tags.missing_person_mentions}
                      emptyLabel={dictionary.staff.detail.aiReview.emptyTagGroup}
                    />
                    <TagGroup
                      label={dictionary.staff.detail.aiReview.incidentTagsLabel}
                      values={intakeReview.suggested_tags.incident_or_resource_types}
                      emptyLabel={dictionary.staff.detail.aiReview.emptyTagGroup}
                    />
                    <TagGroup
                      label={dictionary.staff.detail.aiReview.followUpTagsLabel}
                      values={intakeReview.suggested_tags.follow_up_needs}
                      emptyLabel={dictionary.staff.detail.aiReview.emptyTagGroup}
                    />
                  </div>
                </div>
              ) : (
                <p className="support-copy">
                  {intakeReview?.fallback_message || dictionary.staff.detail.aiReview.fallbackMessage}
                </p>
              )}
            </section>

            <section className="detail-card staff-sidebar-panel" aria-labelledby="staff-voice-title">
              <h2 className="section-title" id="staff-voice-title">
                {dictionary.staff.detail.voice.title}
              </h2>
              {isVoiceLoading ? (
                <p className="support-copy">{dictionary.staff.session.loading}</p>
              ) : voiceDetail ? (
                <div className="detail-grid">
                  <div className="detail-card">
                    <dt>{dictionary.staff.detail.voice.transcriptStateLabel}</dt>
                    <dd>{voiceDetail.transcript_state}</dd>
                  </div>
                  <div className="detail-card">
                    <dt>{dictionary.staff.detail.voice.languageLabel}</dt>
                    <dd>{voiceDetail.transcription_language_code ?? caseDetail.language_code}</dd>
                  </div>
                  <div className="detail-card">
                    <dt>{dictionary.staff.detail.voice.confidenceLabel}</dt>
                    <dd>
                      {typeof voiceDetail.transcription_confidence === "number"
                        ? `${Math.round(voiceDetail.transcription_confidence * 100)}%`
                        : dictionary.staff.detail.voice.notAvailable}
                    </dd>
                  </div>
                  <div className="detail-card detail-card-wide">
                    <dt>{dictionary.staff.detail.voice.transcriptLabel}</dt>
                    <dd>{voiceDetail.confirmed_transcript_text ?? voiceDetail.transcription_text}</dd>
                  </div>
                </div>
              ) : (
                <p className="support-copy">{dictionary.staff.detail.voice.empty}</p>
              )}
            </section>

            <section className="detail-card staff-sidebar-panel" aria-labelledby="staff-contact-title">
              <h2 className="section-title" id="staff-contact-title">
                {dictionary.staff.detail.contactTitle}
              </h2>
              <dl className="detail-grid">
                {reporterItems.map((item) => (
                  <div className="detail-card" key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="detail-card staff-sidebar-panel" aria-labelledby="staff-context-title">
              <h2 className="section-title" id="staff-context-title">
                {dictionary.staff.detail.caseContextTitle}
              </h2>
              <dl className="detail-grid">
                {caseContextItems.map((item) => (
                  <div className={item.wide ? "detail-card detail-card-wide" : "detail-card"} key={item.label}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}

async function loadOptionalVoiceDetail(accessToken: string, caseId: number) {
  try {
    return await withStaffAuthorization(accessToken, (token) => getStaffCaseVoice(token, caseId));
  } catch (error) {
    if (error instanceof MissingStaffSessionError || error instanceof UnauthorizedStaffSessionError) {
      throw error;
    }
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    return null;
  }
}

async function loadOptionalIntakeReview(accessToken: string, caseId: number) {
  try {
    return await withStaffAuthorization(accessToken, (token) => getStaffCaseIntakeReview(token, caseId));
  } catch (error) {
    if (error instanceof MissingStaffSessionError || error instanceof UnauthorizedStaffSessionError) {
      throw error;
    }
    if (error instanceof ApiError && error.status === 404) {
      throw error;
    }
    return {
      status: "unavailable",
      suggestion_only: true,
      source_inputs: [],
      source_preview: "",
      disclaimer: "",
      staff_summary_suggestion: null,
      suggested_tags: null,
      fallback_message: "",
  } satisfies StaffCaseIntakeReviewResponse;
  }
}

type RelatedMarker = {
  relatedCaseId: number;
  relationType: StaffCaseRelationType;
  createdAt: string;
};

function TagGroup({
  label,
  values,
  emptyLabel,
}: {
  label: string;
  values: string[];
  emptyLabel: string;
}) {
  return (
    <div>
      <p className="field-label">{label}</p>
      {values.length > 0 ? (
        <ul className="staff-tag-list">
          {values.map((value) => (
            <li className="staff-tag-chip" key={value}>
              {formatTagLabel(value)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="support-copy">{emptyLabel}</p>
      )}
    </div>
  );
}

function formatTagLabel(value: string) {
  return value.replace(/_/g, " ");
}

function redirectToLogin(
  router: ReturnType<typeof useRouter>,
  locale: Locale,
  reason: StaffAuthReason,
) {
  router.replace(buildStaffLoginHref(locale, reason));
}

function getActorLabel(dictionary: Dictionary, actorType: string) {
  if (actorType in dictionary.staff.detail.actorTypes) {
    return dictionary.staff.detail.actorTypes[
      actorType as keyof typeof dictionary.staff.detail.actorTypes
    ];
  }

  return actorType;
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

function hasContactDetail(caseDetail: StaffCaseDetailResponse) {
  return Boolean(caseDetail.reporter_name || caseDetail.reporter_email || caseDetail.reporter_phone);
}

function getStatusReviewState(status: CaseStatus) {
  if (status === "safe_resolved" || status === "closed") {
    return "confirmed";
  }

  if (status === "active") {
    return "review";
  }

  return "pending";
}

function getStatusReviewStateLabel(dictionary: Dictionary, status: CaseStatus) {
  if (status === "safe_resolved" || status === "closed") {
    return dictionary.staff.detail.confirmedState;
  }

  if (status === "active") {
    return dictionary.staff.detail.reviewNeededState;
  }

  return dictionary.staff.detail.pendingState;
}

function buildReviewChecklistItem(
  title: string,
  description: string,
  state: "confirmed" | "review" | "pending",
  stateLabel: string,
) {
  return {
    title,
    description,
    state: stateLabel,
    pillClassName: getReviewStatePillClassName(state),
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

function getReviewStatePillClassName(state: "confirmed" | "review" | "pending") {
  if (state === "confirmed") {
    return "status-pill";
  }

  if (state === "review") {
    return "status-pill status-pill-warning";
  }

  return "status-pill status-pill-neutral";
}
