"use client";

import type { StaffCaseListItem, StaffReportListItem } from "@/lib/api-types";
import { parseNarrativeFields } from "@/lib/staff-narrative";

/**
 * Field-by-field comparison of the records in a duplicate group.
 *
 * Two truncated blobs of narrative side by side cannot answer the question a
 * reviewer is actually asking: which of these is right, and what does one say
 * that the other does not. Parsing both into fields and aligning them on the
 * same rows makes disagreement and absence visible, and the reviewer can read
 * every value in full.
 */

export type CompareColumn = {
  key: string;
  code: string;
  kind: "case" | "report";
  /** Fields parsed out of the narrative, plus the structured ones. */
  values: Map<string, string>;
};

const STRUCTURED_LOCATION = "Location";
const STRUCTURED_UPDATED = "Last updated";

export function buildCompareColumns(
  cases: StaffCaseListItem[],
  reports: StaffReportListItem[],
  formatDate: (value: string) => string,
): CompareColumn[] {
  const columns: CompareColumn[] = [];

  for (const item of cases) {
    const values = new Map<string, string>();
    values.set(STRUCTURED_LOCATION, item.location_summary || "");
    for (const field of parseNarrativeFields(item.needs_summary).fields) {
      values.set(field.label, field.value);
    }
    const { rest } = parseNarrativeFields(item.needs_summary);
    if (rest) {
      values.set("Notes", rest);
    }
    values.set(STRUCTURED_UPDATED, item.updated_at ? formatDate(item.updated_at) : "");
    columns.push({ key: `case-${item.id}`, code: item.case_code, kind: "case", values });
  }

  for (const item of reports) {
    const values = new Map<string, string>();
    values.set(STRUCTURED_LOCATION, item.location_text || "");
    // The full narrative, not the 220-character preview.
    for (const field of parseNarrativeFields(item.original_narrative).fields) {
      values.set(field.label, field.value);
    }
    const { rest } = parseNarrativeFields(item.original_narrative);
    if (rest) {
      values.set("Notes", rest);
    }
    const submitted = item.submitted_at ?? item.received_at;
    values.set(STRUCTURED_UPDATED, submitted ? formatDate(submitted) : "");
    columns.push({ key: `report-${item.id}`, code: item.report_code, kind: "report", values });
  }

  return columns;
}

type RowState = "agree" | "conflict" | "partial";

function rowState(values: Array<string | undefined>): RowState {
  const present = values.filter((value) => (value ?? "").trim().length > 0);
  if (present.length === 0) {
    return "agree";
  }
  // Something one record knows and another does not is worth flagging: it is
  // usually the reason to merge rather than to discard.
  if (present.length < values.length) {
    return "partial";
  }
  const first = present[0]!.trim().toLowerCase();
  return present.every((value) => value!.trim().toLowerCase() === first) ? "agree" : "conflict";
}

export function DuplicateCompareTable({ columns }: { columns: CompareColumn[] }) {
  if (columns.length < 2) {
    return null;
  }

  // Row order: location first, timestamp last, narrative fields in between in
  // the order they first appear.
  const labels: string[] = [];
  for (const column of columns) {
    for (const label of column.values.keys()) {
      if (!labels.includes(label)) {
        labels.push(label);
      }
    }
  }
  const ordered = [
    ...labels.filter((label) => label === STRUCTURED_LOCATION),
    ...labels.filter((label) => label !== STRUCTURED_LOCATION && label !== STRUCTURED_UPDATED),
    ...labels.filter((label) => label === STRUCTURED_UPDATED),
  ];

  const conflicts = ordered.filter(
    (label) => rowState(columns.map((column) => column.values.get(label))) === "conflict",
  ).length;

  return (
    <div className="dup-compare">
      <div className="dup-compare-summary">
        {conflicts > 0 ? (
          <span className="dup-compare-flag" data-state="conflict">
            {conflicts} field{conflicts === 1 ? "" : "s"} disagree
          </span>
        ) : (
          <span className="dup-compare-flag" data-state="agree">
            No field disagrees
          </span>
        )}
        <span className="dup-compare-hint">
          Amber means the records disagree; blue means only some of them know it.
        </span>
      </div>

      <div className="dup-compare-scroll">
        <table className="dup-compare-table">
          <thead>
            <tr>
              <th scope="col">Field</th>
              {columns.map((column) => (
                <th key={column.key} scope="col">
                  <span className="dup-compare-code">{column.code}</span>
                  <span className="dup-compare-kind">{column.kind}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordered.map((label) => {
              const cells = columns.map((column) => column.values.get(label));
              const state = rowState(cells);
              return (
                <tr key={label} data-state={state}>
                  <th scope="row">{label}</th>
                  {cells.map((value, index) => (
                    <td key={columns[index].key}>
                      {(value ?? "").trim() ? (
                        value
                      ) : (
                        <span className="dup-compare-missing">not provided</span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
