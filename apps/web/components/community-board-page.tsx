"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PublicBoardResponse, PublicBoardStatus } from "@/lib/api-types";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getPublicBoard } from "@/lib/api";
import type { Dictionary, Locale } from "@/lib/i18n";

const publicBoardMirrorUrl = process.env.NEXT_PUBLIC_COMMUNITY_BOARD_URL ?? "";

type CommunityBoardPageProps = {
  dictionary: Dictionary;
  locale: Locale;
};

export function CommunityBoardPage({
  dictionary,
  locale,
}: CommunityBoardPageProps) {
  const [boardData, setBoardData] = useState<PublicBoardResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  useEffect(() => {
    let isMounted = true;

    async function loadBoard() {
      try {
        const nextBoardData = await getPublicBoard();
        if (!isMounted) {
          return;
        }
        setBoardData(nextBoardData);
        setLoadError(false);
      } catch {
        if (!isMounted) {
          return;
        }
        setLoadError(true);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadBoard();

    return () => {
      isMounted = false;
    };
  }, []);

  const statuses = [
    {
      label: dictionary.board.statuses.unverified.label,
      description: dictionary.board.statuses.unverified.description,
      pillClassName: "status-pill status-pill-warning",
    },
    {
      label: dictionary.board.statuses.safeConfirmed.label,
      description: dictionary.board.statuses.safeConfirmed.description,
      pillClassName: "status-pill",
    },
    {
      label: dictionary.board.statuses.responding.label,
      description: dictionary.board.statuses.responding.description,
      pillClassName: "status-pill status-pill-alert",
    },
    {
      label: dictionary.board.statuses.needsFollowUp.label,
      description: dictionary.board.statuses.needsFollowUp.description,
      pillClassName: "status-pill status-pill-neutral",
    },
    {
      label: dictionary.board.statuses.archived.label,
      description: dictionary.board.statuses.archived.description,
      pillClassName: "status-pill status-pill-neutral",
    },
  ];

  return (
    <main className="page-shell">
      <div className="page-card page-card-wide">
        <div className="community-home-toolbar">
          <div>
            <span className="eyebrow">{dictionary.board.eyebrow}</span>
            <h1 className="headline">{dictionary.board.title}</h1>
            <p className="lede">{dictionary.board.description}</p>
          </div>
          <LanguageSwitcher currentLocale={locale} label={dictionary.home.languagePicker} />
        </div>

        <p className="error-banner" role="alert">
          {dictionary.board.emergencyNotice}
        </p>

        <section className="community-entry-section" aria-labelledby="board-actions-title">
          <div className="community-entry-header">
            <div>
              <h2 className="section-title" id="board-actions-title">
                {dictionary.board.actionsTitle}
              </h2>
              <p className="support-copy">{dictionary.board.actionsDescription}</p>
            </div>
            <div className="button-row">
              <Link className="button-secondary" href={`/${locale}`}>
                {dictionary.board.backHome}
              </Link>
              {publicBoardMirrorUrl ? (
                <a
                  className="button-primary"
                  href={publicBoardMirrorUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {dictionary.board.openMirror}
                </a>
              ) : null}
            </div>
          </div>
        </section>

        <section className="community-entry-section" aria-labelledby="board-status-title">
          <h2 className="section-title" id="board-status-title">
            {dictionary.board.statusLegendTitle}
          </h2>
          <div className="section-grid">
            {statuses.map((status) => (
              <article className="detail-card community-action-card" key={status.label}>
                <div className={status.pillClassName}>{status.label}</div>
                <p className="support-copy community-action-copy">{status.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="community-entry-section" aria-labelledby="board-live-title">
          <div className="community-entry-header">
            <div>
              <h2 className="section-title" id="board-live-title">
                {dictionary.board.liveTitle}
              </h2>
              <p className="support-copy">{dictionary.board.liveDescription}</p>
            </div>
          </div>

          {boardData ? (
            <>
              <div className="section-grid">
                <article className="detail-card">
                  <dt>{dictionary.board.summary.totalRecords}</dt>
                  <dd>{boardData.summary.total_records}</dd>
                </article>
                <article className="detail-card">
                  <dt>{dictionary.board.summary.unverified}</dt>
                  <dd>{boardData.summary.unverified}</dd>
                </article>
                <article className="detail-card">
                  <dt>{dictionary.board.summary.responding}</dt>
                  <dd>{boardData.summary.responding}</dd>
                </article>
                <article className="detail-card">
                  <dt>{dictionary.board.summary.needsFollowUp}</dt>
                  <dd>{boardData.summary.needs_follow_up}</dd>
                </article>
                <article className="detail-card">
                  <dt>{dictionary.board.summary.safeConfirmed}</dt>
                  <dd>{boardData.summary.safe_confirmed}</dd>
                </article>
              </div>

              <p className="field-hint">{resolveSourceMode(dictionary, boardData.source_mode)}</p>

              {boardData.records.length === 0 ? (
                <p className="info-banner">{dictionary.board.empty}</p>
              ) : (
                <div className="community-board-records">
                  {boardData.records.map((record) => (
                    <article className="detail-card community-board-card" key={record.case_code}>
                      <div className="community-board-card-header">
                        <div>
                          <div className={statusClassName(record.board_status)}>
                            {statusLabel(dictionary, record.board_status)}
                          </div>
                          <h3 className="section-title community-action-title">{record.location_summary}</h3>
                        </div>
                        <p className="field-hint community-board-code">
                          {dictionary.board.recordCodeLabel}: {record.case_code}
                        </p>
                      </div>

                      <p className="support-copy community-action-copy">{record.needs_summary}</p>

                      <dl className="community-board-meta">
                        <div>
                          <dt>{dictionary.board.urgencyLabel}</dt>
                          <dd>{record.urgency}</dd>
                        </div>
                        <div>
                          <dt>{dictionary.board.incidentTypeLabel}</dt>
                          <dd>{record.incident_type}</dd>
                        </div>
                        <div>
                          <dt>{dictionary.board.createdAtLabel}</dt>
                          <dd>{dateFormatter.format(new Date(record.created_at))}</dd>
                        </div>
                        <div>
                          <dt>{dictionary.board.updatedAtLabel}</dt>
                          <dd>{dateFormatter.format(new Date(record.updated_at))}</dd>
                        </div>
                      </dl>

                      <div className="community-board-update">
                        <h4 className="community-board-subtitle">{dictionary.board.latestUpdateLabel}</h4>
                        <p className="support-copy">
                          {record.latest_public_update ?? dictionary.board.latestUpdateFallback}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          ) : loadError ? (
            <p className="error-banner">{dictionary.board.loadError}</p>
          ) : (
            <p className="info-banner">{isLoading ? dictionary.board.loading : dictionary.board.empty}</p>
          )}
        </section>

        <section className="community-entry-section" aria-labelledby="board-principles-title">
          <h2 className="section-title" id="board-principles-title">
            {dictionary.board.principlesTitle}
          </h2>
          <ul className="community-guidelines-list">
            {dictionary.board.principles.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="community-entry-section" aria-labelledby="board-next-title">
          <h2 className="section-title" id="board-next-title">
            {dictionary.board.nextTitle}
          </h2>
          <p className="support-copy compact-lede">{dictionary.board.nextDescription}</p>
          <div className="section-grid">
            <article className="detail-card community-action-card">
              <h3 className="section-title community-action-title">{dictionary.home.actions.safe.title}</h3>
              <p className="support-copy community-action-copy">{dictionary.board.safePrompt}</p>
              <Link className="button-secondary" href={`/${locale}`}>
                {dictionary.home.actions.safe.cta}
              </Link>
            </article>
            <article className="detail-card community-action-card">
              <h3 className="section-title community-action-title">{dictionary.home.actions.missing.title}</h3>
              <p className="support-copy community-action-copy">{dictionary.board.missingPrompt}</p>
              <Link className="button-secondary" href={`/${locale}`}>
                {dictionary.home.actions.missing.cta}
              </Link>
            </article>
            <article className="detail-card community-action-card">
              <h3 className="section-title community-action-title">{dictionary.home.actions.update.title}</h3>
              <p className="support-copy community-action-copy">{dictionary.board.updatePrompt}</p>
              <Link className="button-secondary" href={`/${locale}`}>
                {dictionary.home.actions.update.cta}
              </Link>
            </article>
          </div>
        </section>
      </div>
    </main>
  );
}

function statusClassName(status: PublicBoardStatus) {
  if (status === "unverified") {
    return "status-pill status-pill-warning";
  }
  if (status === "responding") {
    return "status-pill status-pill-alert";
  }
  if (status === "safe_confirmed") {
    return "status-pill";
  }
  return "status-pill status-pill-neutral";
}

function statusLabel(dictionary: Dictionary, status: PublicBoardStatus) {
  if (status === "unverified") {
    return dictionary.board.statuses.unverified.label;
  }
  if (status === "responding") {
    return dictionary.board.statuses.responding.label;
  }
  if (status === "needs_follow_up") {
    return dictionary.board.statuses.needsFollowUp.label;
  }
  if (status === "safe_confirmed") {
    return dictionary.board.statuses.safeConfirmed.label;
  }
  return dictionary.board.statuses.archived.label;
}

function resolveSourceMode(dictionary: Dictionary, sourceMode: PublicBoardResponse["source_mode"]) {
  if (sourceMode === "derived_from_cases") {
    return dictionary.board.sourceModeDerived;
  }

  return sourceMode;
}
