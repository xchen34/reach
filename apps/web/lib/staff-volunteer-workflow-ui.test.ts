import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const listSource = readFileSync(new URL("../components/staff-case-list-page.tsx", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("../components/staff-case-detail-page.tsx", import.meta.url), "utf8");
const proxySource = readFileSync(new URL("../app/api/[...path]/route.ts", import.meta.url), "utf8");

test("associated report cards use one task entry point and no old help-request label", () => {
  assert.match(listSource, /dictionary\.staff\.cases\.openTaskAction/);
  assert.match(listSource, /report\.linked_case\?\.operational_status/);
  assert.doesNotMatch(listSource, /viewHelpRequestAction/);
  assert.doesNotMatch(listSource, /dictionary\.staff\.cases\.addedToHelpListStatus/);
});

test("report cards use specific ambiguity labels instead of the generic needs-more-info badge", () => {
  assert.match(listSource, /unknownSubjectTypeLabel/);
  assert.match(listSource, /possibleDuplicateLabel/);
  assert.match(listSource, /possibleUpdateLabel/);
  assert.match(listSource, /incompleteDetailsLabel/);
  assert.doesNotMatch(listSource, /需要更多信息/);
});

test("completed task detail exposes confirmed status correction with a final confirmation", () => {
  assert.match(detailSource, /correctStatusAction/);
  assert.match(detailSource, /correctStaffCaseOperationalStatus/);
  assert.match(detailSource, /confirmStatusCorrectionPrompt/);
  assert.match(detailSource, /window\.confirm\(prompt\)/);
  assert.match(detailSource, /operational_status_correction/);
});

test("frontend API proxy forwards the status correction route", () => {
  assert.match(proxySource, /method: "PATCH", pattern: \/\^staff\\\/cases\\\/\\d\+\\\/operational-status\$\//);
});
