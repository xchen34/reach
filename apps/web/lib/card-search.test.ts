import assert from "node:assert/strict";
import test from "node:test";

import { matchesCardSearch, normalizeCardSearch } from "./card-search.ts";

test("normalizeCardSearch strips punctuation and casing", () => {
  assert.equal(normalizeCardSearch("  Ref-12 / A "), "ref12a");
});

test("matchesCardSearch matches against name or ref fields", () => {
  assert.equal(matchesCardSearch(["Alice Green", "RPT-204"], "alice"), true);
  assert.equal(matchesCardSearch(["Alice Green", "RPT-204"], "204"), true);
  assert.equal(matchesCardSearch(["Alice Green", "RPT-204"], "missing"), false);
});
