// Guards the date computed by src/app/api/run/route.ts's POST handler
// (career-ops#4603).
//
// `new Date().toISOString().slice(0, 10)` is the UTC day. That value named the
// PDF paths (resolvePdfPaths), filled the prompt's date segment (buildPrompt),
// and reached the report filename and the tracker row's date column via
// run-prompts.mjs — so west of Greenwich, an evening evaluation from the web
// UI stamped tomorrow's date on today's work. batch-runner.sh (the CLI path)
// and the followups/log route already resolve the local day for the same
// reason — this route was the one holdout using the UTC one.
//
// route.ts is TypeScript and imports via the `@/` path alias, which plain
// `node --test` cannot resolve without the Next.js build — same constraint
// tests/lib/pipeline-local-today.test.mjs documents for pipeline.ts. This
// reads the source and asserts the shape rather than importing the route.
// The fix itself (swapping in localISODate()) was verified by execution
// against `web/src/lib/followups.ts`'s own implementation before this guard
// was written: localISODate() returns the LOCAL calendar day, computed from
// getFullYear()/getMonth()/getDate() rather than toISOString().
//
// Run (from web/, as `npm test` does):  node --test tests/lib/run-route-local-today.test.mjs
// From the repo root:                   node --test web/tests/lib/run-route-local-today.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "app", "api", "run", "route.ts");
const src = readFileSync(SRC, "utf8");

test("the legacy UTC-day pattern is gone from route.ts", () => {
  assert.doesNotMatch(
    src,
    /new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/,
    `${SRC}: resolves "today" with the UTC day again. West of Greenwich this ` +
      `stamps the report, PDF paths and tracker row a day ahead of the user's ` +
      `own clock (#4603) — use localISODate() from @/lib/followups instead.`,
  );
});

test("today comes from localISODate()", () => {
  assert.match(
    src,
    /const\s+today\s*=\s*localISODate\(\)\s*;/,
    `${SRC}: expected \`const today = localISODate();\`.`,
  );
});

test("localISODate is imported from @/lib/followups", () => {
  assert.match(
    src,
    /import\s*{\s*localISODate\s*}\s*from\s+["']@\/lib\/followups["'];/,
    `${SRC}: expected \`import { localISODate } from "@/lib/followups";\` — ` +
      `the same module the followups/log route already imports it from.`,
  );
});
