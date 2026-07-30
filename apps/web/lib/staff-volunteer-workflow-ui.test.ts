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

test("report cards use specific ambiguity labels and hide unknown subject type from volunteer cards", () => {
  assert.doesNotMatch(listSource, /badges\.push\(dictionary\.staff\.cases\.unknownSubjectTypeLabel\)/);
  assert.match(listSource, /possibleDuplicateLabel/);
  assert.match(listSource, /possibleUpdateLabel/);
  assert.match(listSource, /incompleteDetailsLabel/);
  assert.doesNotMatch(listSource, /需要更多信息/);
});

test("staff page shows tasks first and keeps processed reports out of the main new-report list", () => {
  assert.match(listSource, /const reportsNeedingReview = state\.reports\.reports\.filter\(\(report\) => report\.triage_status === "awaiting_review"\)/);
  assert.match(listSource, /activeIncidents = state\.incidents\.filter\(\(incident\) => incident\.status === "active"\)/);
  assert.doesNotMatch(listSource, /<option value="all">/);
});

test("staff page explains claimed-task follow-up without promising rescue dispatch", () => {
  const zhSource = readFileSync(new URL("./locales/zh.ts", import.meta.url), "utf8");
  assert.match(listSource, /actionGuideTitle/);
  assert.match(listSource, /actionGuideSteps\.map/);
  assert.match(zhSource, /领取任务表示你负责跟进这张卡/);
  assert.match(zhSource, /Reach 不会自动派发官方救援/);
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
