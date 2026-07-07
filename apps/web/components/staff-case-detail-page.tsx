"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  createStaffCaseAction,
  getCurrentStaffSession,
  getStaffCaseDetail,
  listStaffCaseAudit,
  logoutStaffSession,
} from "@/lib/api";
import {
  caseStatuses,
  type AuditLogEntryResponse,
  type CaseStatus,
  type CurrentStaffSession,
  type StaffCaseDetailResponse,
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
      const caseDetail = await withStaffAuthorization(token, (staffAccessToken) =>
        getStaffCaseDetail(staffAccessToken, caseId),
      );
      const auditEntries = await withStaffAuthorization(token, (staffAccessToken) =>
        listStaffCaseAudit(staffAccessToken, caseId),
      );

      setState({
        status: "ready",
        accessToken: token,
        session,
        caseDetail,
        auditEntries,
      });
      setNextStatus(caseDetail.status);
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
    setIsSubmittingStatus(true);

    try {
      await withStaffAuthorization(state.accessToken, (token) =>
        createStaffCaseAction(token, caseId, {
          action_type: "status_change",
          to_status: nextStatus,
        }),
      );
      setActionSuccess(dictionary.staff.detail.statusSuccess);
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

  return (
    <main className="page-shell">
      <div className="page-card">
        <div className="staff-toolbar">
          <div>
            <span className="eyebrow">{dictionary.staff.eyebrow}</span>
            <h1 className="headline staff-headline">{dictionary.staff.detail.title}</h1>
            <p className="lede">{dictionary.staff.detail.description}</p>
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

        <div className="button-row">
          <Link className="button-secondary" href={`/${locale}/staff`}>
            {dictionary.staff.detail.backToList}
          </Link>
        </div>

        <section className="detail-grid">
          <div className="detail-card">
            <dt>{dictionary.staff.detail.caseCodeLabel}</dt>
            <dd>{caseDetail.case_code}</dd>
          </div>
          <div className="detail-card">
            <dt>{dictionary.staff.detail.statusLabel}</dt>
            <dd>{dictionary.caseStatus.labels[caseDetail.status]}</dd>
          </div>
          <div className="detail-card">
            <dt>{dictionary.staff.detail.assignedLabel}</dt>
            <dd>{caseDetail.assigned_staff_user?.email ?? dictionary.staff.detail.unassigned}</dd>
          </div>
          <div className="detail-card">
            <dt>{dictionary.staff.detail.viewerLabel}</dt>
            <dd>{session.user.email}</dd>
          </div>
          <div className="detail-card">
            <dt>{dictionary.staff.detail.urgencyLabel}</dt>
            <dd>{dictionary.home.form.urgency.options[caseDetail.urgency]}</dd>
          </div>
          <div className="detail-card">
            <dt>{dictionary.staff.detail.incidentTypeLabel}</dt>
            <dd>{dictionary.home.form.incidentType.options[caseDetail.incident_type]}</dd>
          </div>
          <div className="detail-card detail-card-wide">
            <dt>{dictionary.staff.detail.locationLabel}</dt>
            <dd>{caseDetail.location_summary}</dd>
          </div>
          <div className="detail-card detail-card-wide">
            <dt>{dictionary.staff.detail.needsLabel}</dt>
            <dd>{caseDetail.needs_summary}</dd>
          </div>
          <div className="detail-card detail-card-wide">
            <dt>{dictionary.staff.detail.latestUpdateLabel}</dt>
            <dd>{caseDetail.latest_public_update ?? dictionary.staff.detail.latestUpdateFallback}</dd>
          </div>
          <div className="detail-card">
            <dt>{dictionary.staff.detail.createdAtLabel}</dt>
            <dd>{dateFormatter.format(new Date(caseDetail.created_at))}</dd>
          </div>
          <div className="detail-card">
            <dt>{dictionary.staff.detail.updatedAtLabel}</dt>
            <dd>{dateFormatter.format(new Date(caseDetail.updated_at))}</dd>
          </div>
        </section>

        <section className="staff-contact-panel" aria-labelledby="staff-contact-title">
          <h2 className="section-title" id="staff-contact-title">
            {dictionary.staff.detail.contactTitle}
          </h2>
          <div className="detail-grid">
            <div className="detail-card">
              <dt>{dictionary.staff.detail.languageLabel}</dt>
              <dd>{caseDetail.language_code}</dd>
            </div>
            <div className="detail-card">
              <dt>{dictionary.staff.detail.reporterNameLabel}</dt>
              <dd>{caseDetail.reporter_name ?? dictionary.staff.detail.contactFallback}</dd>
            </div>
            <div className="detail-card">
              <dt>{dictionary.staff.detail.reporterEmailLabel}</dt>
              <dd>{caseDetail.reporter_email ?? dictionary.staff.detail.contactFallback}</dd>
            </div>
            <div className="detail-card">
              <dt>{dictionary.staff.detail.reporterPhoneLabel}</dt>
              <dd>{caseDetail.reporter_phone ?? dictionary.staff.detail.contactFallback}</dd>
            </div>
          </div>
        </section>

        <section className="staff-actions-panel" aria-labelledby="staff-actions-title">
          <h2 className="section-title" id="staff-actions-title">
            {dictionary.staff.detail.actionsTitle}
          </h2>

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
            <form className="detail-card form-stack" noValidate onSubmit={handleNoteSubmit}>
              <label className="field">
                <span className="field-label">{dictionary.staff.detail.noteLabel}</span>
                <textarea
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
                <span className="field-hint">{dictionary.staff.detail.noteHint}</span>
                {noteError ? <span className="field-error">{noteError}</span> : null}
              </label>
              <button className="button-primary" disabled={isSubmittingNote} type="submit">
                {isSubmittingNote ? dictionary.staff.detail.submitting : dictionary.staff.detail.noteSubmit}
              </button>
            </form>

            <form className="detail-card form-stack" onSubmit={handleStatusSubmit}>
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
                <span className="field-hint">{dictionary.staff.detail.statusChangeHint}</span>
              </label>
              <button className="button-primary" disabled={isSubmittingStatus} type="submit">
                {isSubmittingStatus ? dictionary.staff.detail.submitting : dictionary.staff.detail.statusSubmit}
              </button>
            </form>

            <div className="detail-card form-stack">
              <h3 className="section-title staff-action-title">{dictionary.staff.detail.claimTitle}</h3>
              <p className="field-hint">{dictionary.staff.detail.claimHint}</p>
              <button className="button-secondary" disabled={isClaiming} type="button" onClick={handleClaim}>
                {isClaiming ? dictionary.staff.detail.submitting : dictionary.staff.detail.claimSubmit}
              </button>
            </div>
          </div>
        </section>

        <section className="staff-audit-panel" aria-labelledby="staff-audit-title">
          <h2 className="section-title" id="staff-audit-title">
            {dictionary.staff.detail.auditTitle}
          </h2>

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

function getActorLabel(dictionary: Dictionary, actorType: string) {
  if (actorType in dictionary.staff.detail.actorTypes) {
    return dictionary.staff.detail.actorTypes[
      actorType as keyof typeof dictionary.staff.detail.actorTypes
    ];
  }

  return actorType;
}
