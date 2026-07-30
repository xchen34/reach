"use client";

export type PaginationLabels = {
  next: string;
  pageStatus: string;
  previous: string;
  total: string;
};

export function PaginationControls({
  currentPage,
  labels,
  pageSize,
  totalItems,
  onPageChange,
}: {
  currentPage: number;
  labels: PaginationLabels;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = getPageCount(totalItems, pageSize);
  if (totalPages <= 1) {
    return null;
  }

  const firstItem = (currentPage - 1) * pageSize + 1;
  const lastItem = Math.min(currentPage * pageSize, totalItems);
  const pageStatus = labels.pageStatus
    .replace("{current}", String(currentPage))
    .replace("{total}", String(totalPages));
  const totalStatus = labels.total
    .replace("{first}", String(firstItem))
    .replace("{last}", String(lastItem))
    .replace("{total}", String(totalItems));

  return (
    <nav className="pagination-controls" aria-label={pageStatus}>
      <p className="field-hint compact-copy">{totalStatus}</p>
      <div className="button-row pagination-actions">
        <button
          className="button-secondary"
          disabled={currentPage <= 1}
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        >
          {labels.previous}
        </button>
        <span className="field-hint compact-copy pagination-status">{pageStatus}</span>
        <button
          className="button-secondary"
          disabled={currentPage >= totalPages}
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        >
          {labels.next}
        </button>
      </div>
    </nav>
  );
}

export function getPageCount(totalItems: number, pageSize: number) {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function paginateItems<T>(items: T[], currentPage: number, pageSize: number) {
  const start = (currentPage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
