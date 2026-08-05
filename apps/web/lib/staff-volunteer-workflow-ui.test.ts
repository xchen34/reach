import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const listSource = readFileSync(new URL("../components/staff-case-list-page.tsx", import.meta.url), "utf8");
const detailSource = readFileSync(new URL("../components/staff-case-detail-page.tsx", import.meta.url), "utf8");
const reportDetailSource = readFileSync(new URL("../components/staff-report-detail-page.tsx", import.meta.url), "utf8");
const proxySource = readFileSync(new URL("../app/api/[...path]/route.ts", import.meta.url), "utf8");

test("associated report cards use one task entry point and no old help-request label", () => {
  assert.match(listSource, /dictionary\.staff\.cases\.openCombinedCaseAction/);
  assert.match(listSource, /report\.linked_case\?\.operational_status/);
  assert.match(listSource, /followUpStatusFilters/);
  assert.doesNotMatch(listSource, /viewHelpRequestAction/);
  assert.doesNotMatch(listSource, /dictionary\.staff\.cases\.addedToHelpListStatus/);
});

test("report cards and follow-up cards use the new combined-workspace status labels", () => {
  assert.match(listSource, /<span className=\{getFollowUpStatusClassName\(reportFollowUpStatus\)\}>[\s\S]*?<h3 className="staff-compact-title">\{primaryText\.personName\}<\/h3>/);
  assert.match(listSource, /followUpOverviewTitle/);
  assert.match(listSource, /myFollowUpTitle/);
  assert.match(listSource, /followUpListTitle/);
  assert.match(listSource, /mergeSearchLabel/);
  assert.match(listSource, /href=\{`\/staff\/reports\/\$\{report\.id\}`\}/);
  assert.match(reportDetailSource, /getStaffReportDetail/);
  assert.match(reportDetailSource, /original_narrative/);
  assert.match(listSource, /staff-avatar-shell/);
  assert.match(listSource, /const trimmedCandidateSearch = candidateSearch\.trim\(\)/);
  assert.match(listSource, /: \[\]/);
  assert.match(listSource, /const searchedFollowUpItems = searchQuery/);
  assert.match(listSource, /const visibleFollowUpItems = searchedFollowUpItems \?\? filteredFollowUpItems/);
  assert.match(listSource, /needs_to_be_viewed/);
  assert.match(listSource, /waiting_for_volunteer/);
  assert.match(listSource, /being_followed_up/);
  assert.match(listSource, /found_safe/);
  assert.match(listSource, /found_dead/);
  assert.doesNotMatch(listSource, /badges\.push\(dictionary\.staff\.cases\.unknownSubjectTypeLabel\)/);
  assert.doesNotMatch(listSource, /dictionary\.staff\.cases\.possibleDuplicateLabel/);
  assert.doesNotMatch(listSource, /dictionary\.staff\.cases\.possibleUpdateLabel/);
  assert.doesNotMatch(listSource, /dictionary\.staff\.cases\.incompleteDetailsLabel/);
  assert.doesNotMatch(listSource, /需要更多信息/);
});

test("staff page can find and persist possible duplicate merges", () => {
  assert.match(listSource, /DuplicateReviewPanel/);
  assert.match(listSource, /buildDuplicateGroups/);
  assert.match(listSource, /normalizeDuplicateName/);
  assert.match(listSource, /mergeStaffDuplicateCases/);
  assert.match(listSource, /linkReportToExistingTask/);
  assert.match(listSource, /primaryCaseLabel/);
});

test("staff cards allow notes without removing reports from the queue", () => {
  assert.match(listSource, /addStaffReportNote/);
  assert.match(listSource, /createStaffCaseAction/);
  assert.match(listSource, /InlineNoteEditor/);
  assert.match(listSource, /NoteBadge/);
  assert.match(listSource, /maxLength=\{100\}/);
  assert.match(listSource, /trimmedNote\.length > 100/);
  assert.match(listSource, /setNoteBadge\(note\)/);
  assert.doesNotMatch(listSource, /dismissIncomingReport/);
  assert.doesNotMatch(listSource, /dictionary\.staff\.cases\.noActionNeededAction/);
});

test("inline note editor is full-width so it does not stretch action buttons", () => {
  const cssSource = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(cssSource, /\.staff-inline-note \{/);
  assert.match(cssSource, /flex: 1 0 100%/);
  assert.match(cssSource, /\.staff-note-pill/);
  assert.match(cssSource, /\.staff-stat-grid \{/);
  assert.match(cssSource, /grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/);
  // The placeholder avatar is a shell plus a centred mark. The head/body
  // silhouette these lines described was never implemented on this branch.
  assert.match(cssSource, /\.staff-avatar-shell \{/);
  assert.match(cssSource, /\.staff-avatar-placeholder \{/);
  assert.match(cssSource, /\.staff-avatar-mark \{/);
  assert.match(cssSource, /\.staff-merge-candidate \{/);
});

test("staff page shows tasks first and keeps the all-incidents selector available", () => {
  assert.match(listSource, /const reportsNeedingReview = state\.reports\.reports\.filter\(\(report\) => report\.triage_status === "awaiting_review"\)/);
  assert.match(listSource, /activeIncidents = state\.incidents\.filter\(\(incident\) => incident\.status === "active"\)/);
  assert.match(listSource, /<option value="all">/);
});

test("staff page explains claimed-task follow-up without promising rescue dispatch", () => {
  const enSource = readFileSync(new URL("./locales/en.ts", import.meta.url), "utf8");
  assert.match(listSource, /actionGuideTitle/);
  assert.match(listSource, /actionGuideSteps\.map/);
  assert.match(enSource, /Claiming means you are responsible for following up on this card/);
  assert.match(enSource, /Reach does not dispatch official rescue/);
});

test("staff page shows the combined follow-up list and the all-incidents selector", () => {
  assert.match(listSource, /<option value="all">/);
  assert.match(listSource, /followUpSummary\.total/);
  assert.match(listSource, /staff-stat-grid/);
  assert.match(listSource, /staff-stat-card/);
  assert.match(listSource, /followUpListTitle/);
});

test("staff page paginates the combined follow-up list", () => {
  assert.match(listSource, /const staffListPageSize = 12/);
  assert.match(listSource, /pagedFollowUpItems\.map/);
  assert.match(listSource, /dictionary\.staff\.cases\.pagination/);
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
