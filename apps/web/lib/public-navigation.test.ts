import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("public board keeps the shared Public Info navigation link visible and active-capable", () => {
  const boardPageSource = readFileSync(
    new URL("../components/community-board-page.tsx", import.meta.url),
    "utf8",
  );
  const appShellSource = readFileSync(
    new URL("../components/app-shell.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(boardPageSource, /showPublicBoard=\{false\}/);
  assert.match(appShellSource, /aria-current=\{isBoardActive \? "page" : undefined\}/);
  assert.match(appShellSource, /data-active=\{isBoardActive\}/);
  assert.match(appShellSource, /href=\{boardHref\}/);
  assert.match(appShellSource, /href=\{homeHref\}/);
});

test("shared header derives staff navigation from the validated durable staff session", () => {
  const appShellSource = readFileSync(
    new URL("../components/app-shell.tsx", import.meta.url),
    "utf8",
  );
  const staffSessionHookSource = readFileSync(
    new URL("./use-staff-session-status.ts", import.meta.url),
    "utf8",
  );

  assert.match(staffSessionHookSource, /readStoredStaffAccessToken/);
  assert.match(staffSessionHookSource, /getCurrentStaffSession\(accessToken\)/);
  assert.match(appShellSource, /staffAuthState === "authenticated"/);
  assert.match(appShellSource, /href=\{staffHref\}/);
  assert.match(appShellSource, /aria-current=\{isStaffActive \? "page" : undefined\}/);
  assert.match(appShellSource, /data-active=\{isStaffActive\}/);
});

test("authenticated public pages expose return-to-staff navigation without a logged-out CTA", () => {
  const homeSource = readFileSync(
    new URL("../components/community-coordination-home.tsx", import.meta.url),
    "utf8",
  );
  const staffEntrySource = readFileSync(
    new URL("../components/staff-dashboard-entry-link.tsx", import.meta.url),
    "utf8",
  );
  const boardSource = readFileSync(
    new URL("../components/community-board-page.tsx", import.meta.url),
    "utf8",
  );
  const reportSource = readFileSync(
    new URL("../app/[locale]/incidents/[incidentSlug]/report/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(homeSource, /StaffDashboardEntryLink/);
  assert.match(staffEntrySource, /staffSessionStatus === "authenticated"/);
  assert.match(staffEntrySource, /authenticatedLabel/);
  assert.match(staffEntrySource, /loginLabel/);
  assert.doesNotMatch(homeSource, /href=\{`\\\/\$\\{locale\\}\/staff\/login`\}/);
  assert.match(boardSource, /<AppShell/);
  assert.match(reportSource, /<AppShell/);
});

test("logout clears the durable staff session and notifies shared navigation", () => {
  const appShellSource = readFileSync(
    new URL("../components/app-shell.tsx", import.meta.url),
    "utf8",
  );
  const listSource = readFileSync(
    new URL("../components/staff-case-list-page.tsx", import.meta.url),
    "utf8",
  );
  const detailSource = readFileSync(
    new URL("../components/staff-case-detail-page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(appShellSource, /clearStaffAccessToken\(\)/);
  assert.match(appShellSource, /Reach\.staff-session-changed/);
  assert.match(listSource, /Reach\.staff-session-changed/);
  assert.match(detailSource, /Reach\.staff-session-changed/);
});

test("authenticated header layout keeps the centered navigation independent from account actions", () => {
  const cssSource = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(cssSource, /\.global-header-inner\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(cssSource, /@media \(min-width: 720px\)\s*\{[\s\S]*\.global-header-inner\s*\{[\s\S]*grid-template-columns: 1fr auto 1fr;/);
  assert.match(cssSource, /\.header-navigation-authenticated\s*\{[\s\S]*--app-header-staff-slot-width/);
  assert.match(cssSource, /\.header-account\s*\{[\s\S]*justify-self: end;/);
});
