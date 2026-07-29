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
