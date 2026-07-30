import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const boardSource = readFileSync(new URL("../components/community-board-page.tsx", import.meta.url), "utf8");
const zhLocaleSource = readFileSync(new URL("./locales/zh.ts", import.meta.url), "utf8");

test("public board exposes simple volunteer-facing status filters", () => {
  assert.match(boardSource, /type BoardFilter = "all" \| "missing" \| "safe" \| "deceased"/);
  assert.match(boardSource, /record\.operational_status === "unassigned" \|\| record\.operational_status === "in_progress"/);
  assert.match(boardSource, /record\.operational_status === "found_alive"/);
  assert.match(boardSource, /record\.operational_status === "confirmed_deceased"/);
  assert.match(zhLocaleSource, /missing: "失踪中"/);
  assert.match(zhLocaleSource, /safe: "证实安全"/);
  assert.match(zhLocaleSource, /deceased: "证实离世"/);
});

test("public board hides the internal unknown subject-type badge", () => {
  assert.match(boardSource, /record\.subject_type === "person" \|\| record\.subject_type === "pet"/);
  assert.doesNotMatch(boardSource, /subjectTypeLabel\(dictionary, record\.subject_type\)<\/span>/);
});
