"use client";

import { useEffect, useState } from "react";
import type { PublicBoardResponse, PublicBoardStatus } from "@/lib/api-types";
import { PageHeader } from "@/components/page-header";
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
    <main className="page-shell">
      <div className="page-card community-board-shell">
        <PageHeader
          homeLabel={dictionary.staff.login.backHome}
          languageLabel={dictionary.home.languagePicker}
          locale={locale}
          publicBoardLabel={dictionary.home.boardCta}
          sectionLabel={dictionary.board.eyebrow}
        />

        <div>
          <h1 className="headline headline-compact">{dictionary.board.title}</h1>
          <p className="lede">{dictionary.board.description}</p>
        </div>

        <p className="error-banner" role="alert">
          {dictionary.board.emergencyNotice}
        </p>

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
                  <article className="community-board-card" key={`${record.updated_at}-${record.latest_public_update}`}>
                    <div className="community-board-card-header">
                      <span className={statusClassName(record.board_status)}>
                        {publicStatusLabel(dictionary, record.board_status)}
                      </span>
                      <time dateTime={record.updated_at}>
                        {dateFormatter.format(new Date(record.updated_at))}
                      </time>
                    </div>
                    <p>{record.latest_public_update}</p>
                  </article>
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
    </main>
  );
}

function statusClassName(status: PublicBoardStatus) {
  if (status === "responding" || status === "needs_follow_up") {
    return "status-pill status-pill-alert";
  }
  return "status-pill";
}

function publicStatusLabel(
  dictionary: Dictionary,
  status: PublicBoardStatus,
) {
  if (status === "unverified") {
    return dictionary.board.publicStatuses.pending.label;
  }
  if (status === "responding" || status === "needs_follow_up") {
    return dictionary.board.publicStatuses.inProgress.label;
  }
  return dictionary.board.publicStatuses.resolved.label;
}
