"use client";

import { useEffect, useState } from "react";
import type { OperationalStatus, PublicBoardRecord, PublicBoardResponse, SubjectType } from "@/lib/api-types";
import { AppShell } from "@/components/app-shell";
import { getPublicBoard } from "@/lib/api";
import type { Dictionary, Locale } from "@/lib/i18n";

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

  return (
    <AppShell
      homeLabel={dictionary.staff.login.backHome}
      languageLabel={dictionary.home.languagePicker}
      locale={locale}
      publicBoardLabel={dictionary.home.boardCta}
      sectionLabel={dictionary.board.eyebrow}
    >
      <div className="community-board-shell">
        <div>
          <h1 className="headline headline-compact">{dictionary.board.title}</h1>
          <p className="lede">{dictionary.board.description}</p>
        </div>

        <p className="error-banner" role="alert">
          {dictionary.board.emergencyNotice}
        </p>

        <section className="community-entry-section" aria-labelledby="board-disclaimer-title">
          <h2 className="section-title" id="board-disclaimer-title">
            {dictionary.board.statusDisclaimerTitle}
          </h2>
          {dictionary.board.statusDisclaimerParagraphs.map((paragraph) => (
            <p className="support-copy compact-copy" key={paragraph}>
              {paragraph}
            </p>
          ))}
        </section>

        <section className="community-entry-section" aria-labelledby="board-live-title">
          <div className="community-entry-header">
            <div>
              <h2 className="section-title" id="board-live-title">
                {dictionary.board.liveTitle}
              </h2>
              <p className="field-hint compact-copy">{dictionary.board.liveDescription}</p>
            </div>
          </div>

          {boardData ? (
            boardData.records.length === 0 ? (
              <p className="info-banner">{dictionary.board.empty}</p>
            ) : (
              <div className="community-board-records">
                {boardData.records.map((record) => (
                  <BoardRecordCard
                    dateFormatter={dateFormatter}
                    dictionary={dictionary}
                    key={record.public_id}
                    record={record}
                  />
                ))}
              </div>
            )
          ) : loadError ? (
            <p className="error-banner">{dictionary.board.loadError}</p>
          ) : (
            <p className="info-banner">{isLoading ? dictionary.board.loading : dictionary.board.empty}</p>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function BoardRecordCard({
  dateFormatter,
  dictionary,
  record,
}: {
  dateFormatter: Intl.DateTimeFormat;
  dictionary: Dictionary;
  record: PublicBoardRecord;
}) {
  const subjectName = record.person_label ?? subjectFallbackLabel(dictionary, record.subject_type);
  const imageUrl = record.public_image ? toProxiedAssetUrl(record.public_image.url) : null;

  return (
    <article className="community-board-card">
      {imageUrl ? (
        <div className="community-board-image-frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" className="community-board-image" src={imageUrl} />
        </div>
      ) : null}
      <div className="community-board-card-body">
        <div className="community-board-card-title-row">
          <h3 className="community-board-title">{subjectName}</h3>
          <span className="status-pill status-pill-neutral">{subjectTypeLabel(dictionary, record.subject_type)}</span>
          <span className={statusClassName(record.operational_status)}>
            {publicStatusLabel(dictionary, record.operational_status)}
          </span>
        </div>

        <dl className="community-board-facts">
          <div>
            <dt>{dictionary.board.lastKnownLocationLabel}</dt>
            <dd>{record.last_known_location}</dd>
          </div>
          {record.approximate_age || record.gender ? (
            <div>
              <dt>{dictionary.board.ageLabel}</dt>
              <dd>{[record.approximate_age, record.gender].filter(Boolean).join(" / ")}</dd>
            </div>
          ) : null}
        </dl>

        {record.latest_public_update ? (
          <p className="community-board-update-text">{record.latest_public_update}</p>
        ) : null}

        <time className="community-board-updated" dateTime={record.platform_last_updated_at}>
          {dictionary.board.platformLastUpdatedLabel}{" "}
          {dateFormatter.format(new Date(record.platform_last_updated_at))}
        </time>
      </div>
    </article>
  );
}

function statusClassName(status: OperationalStatus) {
  if (status === "in_progress") {
    return "status-pill status-pill-alert";
  }
  if (status === "unassigned") {
    return "status-pill status-pill-warning";
  }
  return "status-pill";
}

function publicStatusLabel(
  dictionary: Dictionary,
  status: OperationalStatus,
) {
  if (status === "unassigned") {
    return dictionary.board.publicStatuses.unassigned.label;
  }
  if (status === "in_progress") {
    return dictionary.board.publicStatuses.inProgress.label;
  }
  if (status === "found_alive") {
    return dictionary.board.publicStatuses.foundAlive.label;
  }
  return dictionary.board.publicStatuses.confirmedDeceased.label;
}

function subjectTypeLabel(dictionary: Dictionary, subjectType: SubjectType) {
  return dictionary.subjectTypes[subjectType];
}

function subjectFallbackLabel(dictionary: Dictionary, subjectType: SubjectType) {
  if (subjectType === "pet") {
    return dictionary.board.petFallbackLabel;
  }
  if (subjectType === "unknown") {
    return dictionary.board.unknownFallbackLabel;
  }
  return dictionary.board.personFallbackLabel;
}

function toProxiedAssetUrl(url: string) {
  if (url.startsWith("/")) {
    return `/api${url}`;
  }
  return url;
}
