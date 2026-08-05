import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("public board keeps the shared Public Info navigation link visible and active-capable", () => {
  const boardPageSource = readFileSync(
    new URL("../components/community-board-page.tsx", import.meta.url),
    "utf8",
  );
  const headerSource = readFileSync(
    new URL("../components/global-header.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(boardPageSource, /showPublicBoard=\{false\}/);
  assert.match(headerSource, /aria-current=\{isBoardActive \? "page" : undefined\}/);
  assert.match(headerSource, /data-active=\{isBoardActive\}/);
  assert.match(headerSource, /href=\{boardHref\}/);
  assert.doesNotMatch(headerSource, /href=\{homeHref\}/);
});

test("shared header derives staff navigation from the validated durable staff session", () => {
  const headerSource = readFileSync(
    new URL("../components/global-header.tsx", import.meta.url),
    "utf8",
  );
  const staffSessionHookSource = readFileSync(
    new URL("./use-staff-session-status.ts", import.meta.url),
    "utf8",
  );

  assert.match(staffSessionHookSource, /readStoredStaffAccessToken/);
  assert.match(staffSessionHookSource, /getCurrentStaffSession\(accessToken\)/);
  assert.match(headerSource, /staffAuthState === "authenticated"/);
  assert.match(headerSource, /staffEntryHref = staffAuthState === "authenticated" \? staffHref : staffLoginHref/);
  assert.match(headerSource, /href=\{staffEntryHref\}/);
  assert.match(headerSource, /aria-current=\{isStaffEntryActive \? "page" : undefined\}/);
  assert.match(headerSource, /data-active=\{isStaffEntryActive\}/);
  assert.doesNotMatch(headerSource, /header-nav-staff/);
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
  const headerSource = readFileSync(
    new URL("../components/global-header.tsx", import.meta.url),
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

  assert.match(headerSource, /clearStaffAccessToken\(\)/);
  assert.match(headerSource, /Reach\.staff-session-changed/);
  assert.match(listSource, /Reach\.staff-session-changed/);
  assert.match(detailSource, /Reach\.staff-session-changed/);
});

test("authenticated header layout keeps the centered navigation independent from account actions", () => {
  const cssSource = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

  // The header bar is flex, so the old grid-template-columns assertions were
  // checking declarations that never applied. Assert the mechanism that does:
  // the bar spreads brand / nav / account, the nav centres itself, and every
  // control shares one slot width so the set stays even.
  assert.match(cssSource, /\.global-header-inner\s*\{[\s\S]*display: flex;[\s\S]*justify-content: space-between;/);
  assert.match(cssSource, /\.header-navigation,\s*\n\.header-navigation-authenticated\s*\{[\s\S]*justify-content: center;/);
  assert.match(cssSource, /--nav-slot:/);
  assert.match(cssSource, /\.header-account \.header-nav-button\s*\{\s*\n\s*width: var\(--nav-slot\);/);
  assert.doesNotMatch(cssSource, /--app-header-staff-slot-width/);
});
