"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  OperationalStatus,
  PublicBoardRecord,
  PublicBoardResponse,
  PublicIncidentReportPageResponse,
  SubjectType,
} from "@/lib/api-types";
import { AppShell } from "@/components/app-shell";
import { PaginationControls, getPageCount, paginateItems } from "@/components/pagination-controls";
import { getCurrentPublicIncidentReportPage, getPublicBoard } from "@/lib/api";
import { matchesCardSearch } from "@/lib/card-search";
import type { Dictionary, Locale } from "@/lib/i18n";

type CommunityBoardPageProps = {
  dictionary: Dictionary;
  locale: Locale;
};

type BoardFilter = "all" | "missing" | "safe" | "deceased";

const boardPageSize = 24;

export function CommunityBoardPage({
  dictionary,
  locale,
}: CommunityBoardPageProps) {
  const [boardData, setBoardData] = useState<PublicBoardResponse | null>(null);
  const [currentIncident, setCurrentIncident] = useState<PublicIncidentReportPageResponse | null>(null);
  const [activeFilter, setActiveFilter] = useState<BoardFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [loadError, setLoadError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const filteredRecords = useMemo(() => {
    if (!boardData) {
      return [];
    }
    return boardData.records.filter(
      (record) =>
        matchesBoardFilter(record, activeFilter) &&
        matchesCardSearch([record.person_label, record.case_code], searchQuery),
    );
  }, [activeFilter, boardData, searchQuery]);
  const filterCounts = useMemo(() => summarizeBoardFilters(boardData?.records ?? []), [boardData]);
  const totalPages = getPageCount(filteredRecords.length, boardPageSize);
  const pagedRecords = useMemo(
    () => paginateItems(filteredRecords, currentPage, boardPageSize),
    [currentPage, filteredRecords],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter, searchQuery]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    let isMounted = true;

    async function loadBoard() {
      try {
        const [nextBoardData, incident] = await Promise.all([
          getPublicBoard(),
          getCurrentPublicIncidentReportPage().catch(() => null),
        ]);
        if (!isMounted) {
          return;
        }
        setBoardData(nextBoardData);
        setCurrentIncident(incident);
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

        <section className="community-entry-section board-report-entry" aria-labelledby="board-report-title">
          <div>
            <h2 className="section-title" id="board-report-title">
              {dictionary.board.reportTitle}
            </h2>
            <p className="support-copy compact-copy">{dictionary.board.reportDescription}</p>
          </div>
          {currentIncident ? (
            <Link className="button-primary" href={`/incidents/${currentIncident.slug}/report`}>
              {dictionary.board.reportCta}
            </Link>
          ) : (
            <p className="info-banner">{dictionary.home.formUnavailable}</p>
          )}
        </section>

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
              <>
                <label className="field-label compact-copy board-search-row">
                  {dictionary.board.searchLabel}
                  <input
                    className="input-field"
                    type="search"
                    value={searchQuery}
                    placeholder={dictionary.board.searchPlaceholder}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                </label>
                <div className="board-filter-row" role="group" aria-label={dictionary.board.filterLabel}>
                  {boardFilterOptions.map((filter) => (
                    <button
                      className="button-secondary header-nav-button"
                      data-active={activeFilter === filter}
                      key={filter}
                      type="button"
                      onClick={() => setActiveFilter(filter)}
                    >
                      {boardFilterLabel(dictionary, filter)} ({filterCounts[filter]})
                    </button>
                ))}
              </div>
                {filteredRecords.length === 0 ? (
                  <p className="info-banner">
                    {searchQuery.trim() ? dictionary.board.searchEmpty : dictionary.board.emptyForFilter}
                  </p>
                ) : (
                  <div className="community-board-records">
                    {pagedRecords.map((record) => (
                      <BoardRecordCard
                        dateFormatter={dateFormatter}
                        dictionary={dictionary}
                        key={record.public_id}
                        record={record}
                      />
                    ))}
                  </div>
                )}
                <PaginationControls
                  currentPage={currentPage}
                  labels={dictionary.board.pagination}
                  pageSize={boardPageSize}
                  totalItems={filteredRecords.length}
                  onPageChange={setCurrentPage}
                />
              </>
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
          <span className="status-pill status-pill-neutral">REF {record.case_code}</span>
          {record.subject_type === "person" || record.subject_type === "pet" ? (
            <span className="status-pill status-pill-neutral">{subjectTypeLabel(dictionary, record.subject_type)}</span>
          ) : null}
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

const boardFilterOptions: BoardFilter[] = ["all", "missing", "safe", "deceased"];

function matchesBoardFilter(record: PublicBoardRecord, filter: BoardFilter) {
  if (filter === "all") {
    return true;
  }
  if (filter === "missing") {
    return record.operational_status === "unassigned" || record.operational_status === "in_progress";
  }
  if (filter === "safe") {
    return record.operational_status === "found_alive";
  }
  return record.operational_status === "confirmed_deceased";
}

function summarizeBoardFilters(records: PublicBoardRecord[]): Record<BoardFilter, number> {
  return records.reduce(
    (summary, record) => {
      summary.all += 1;
      if (record.operational_status === "found_alive") {
        summary.safe += 1;
      } else if (record.operational_status === "confirmed_deceased") {
        summary.deceased += 1;
      } else {
        summary.missing += 1;
      }
      return summary;
    },
    { all: 0, missing: 0, safe: 0, deceased: 0 },
  );
}

function boardFilterLabel(dictionary: Dictionary, filter: BoardFilter) {
  if (filter === "all") {
    return dictionary.board.filters.all;
  }
  if (filter === "missing") {
    return dictionary.board.filters.missing;
  }
  if (filter === "safe") {
    return dictionary.board.filters.safe;
  }
  return dictionary.board.filters.deceased;
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
