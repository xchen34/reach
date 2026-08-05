import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const boardSource = readFileSync(new URL("../components/community-board-page.tsx", import.meta.url), "utf8");
const enLocaleSource = readFileSync(new URL("./locales/en.ts", import.meta.url), "utf8");

test("public board exposes simple volunteer-facing status filters", () => {
  assert.match(boardSource, /type BoardFilter = "all" \| "missing" \| "safe" \| "deceased"/);
  assert.match(boardSource, /record\.operational_status === "unassigned" \|\| record\.operational_status === "in_progress"/);
  assert.match(boardSource, /record\.operational_status === "found_alive"/);
  assert.match(boardSource, /record\.operational_status === "confirmed_deceased"/);
  // Wording aligned with staff.cases.operationalStatuses: the board, the
  // dashboard and the change-status dialog previously gave these same four
  // states three different names.
  assert.match(enLocaleSource, /missing: "Still missing"/);
  assert.match(enLocaleSource, /safe: "Found safe"/);
  assert.match(enLocaleSource, /deceased: "Confirmed deceased"/);
  assert.match(boardSource, /const boardPageSize = 24/);
  assert.match(boardSource, /PaginationControls/);
});

test("public board hides the internal unknown subject-type badge", () => {
  assert.match(boardSource, /record\.subject_type === "person" \|\| record\.subject_type === "pet"/);
  assert.doesNotMatch(boardSource, /subjectTypeLabel\(dictionary, record\.subject_type\)<\/span>/);
});

test("public board exposes a public ref on each record card", () => {
  assert.match(boardSource, /REF \{record\.case_code\}/);
});
