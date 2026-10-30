// tests/headless-permission-flags.test.mjs — no spawner outside the known set
// may hand a headless worker blanket approval (#2876).
//
// The web already has this guard (web/tests/lib/clis-permissions.test.mjs),
// but it reads only web/src/lib/clis.ts. The root spawners are invisible to
// it: batch-tailor.mjs launches the `pdf` worker with
// --dangerously-skip-permissions, which hands back the Bash that #2172 took
// away on the web path, and nothing went red. So the rule written in AGENTS.md
// ("Headless worker permissions") is enforced here, in the root suite.
//
// Discovery, not a list of files to scan: the whole tree is walked and every
// code file whose argv carries one of the flags is collected. The result must
// equal KNOWN below, in both directions — a new spawner fails, and so does an
// entry that no longer passes a flag, so the list cannot rot into a blanket
// allowance after the debt is paid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { ROOT } from './helpers.mjs';
import { walkTree } from '../lib/walk-tree.mjs';

/** Flags that hand a CLI blanket approval for write-capable tools. The web
 *  guard's list plus the Codex forms cli-fencing.mjs refuses. */
const AUTO_APPROVE = [
  '--dangerously-skip-permissions',
  '--dangerously-bypass-approvals-and-sandbox',
  '--always-approve',
  '--yolo',
  '--full-auto',
  '--auto-approve',
  '--approve-all',
  '--skip-permissions',
  '--no-confirm',
];

/** Every file allowed to name a flag above, and why. Adding a line here is a
 *  permission change: it needs the same review as the spawner itself. */
const KNOWN = new Map([
  ['batch-tailor.mjs', 'pdf worker under claude -p — the gap #2876 tracks; the fix is the harness rendering the PDF, not a flag'],
  ['batch/batch-runner.sh', 'evaluate worker under claude -p and grok -p — tracked in #2876'],
  ['web/src/lib/cli-fencing.mjs', 'not a spawner: names the Codex flags in order to refuse them'],
]);

const CODE_EXT = new Set(['.mjs', '.js', '.cjs', '.ts', '.tsx', '.sh', '.bash', '.py', '.go']);
// Extensionless entry points that spawn things.
const CODE_NAMES = new Set(['cops']);
// Never code that ships, or code whose job is to mention the flags.
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'tests', 'test-fixtures', 'output', 'reports', 'data', 'jds']);

function isScannedFile(name) {
  return (CODE_EXT.has(extname(name)) || CODE_NAMES.has(name))
    && !/\.test\.[cm]?[jt]sx?$/.test(name);
}

// walkTree, not a hand-rolled readdir loop: it applies the nested-checkout
// guard, so a linked worktree inside this one cannot feed its spawners in.
function codeFiles() {
  return walkTree(ROOT, {
    skip: (entry) => (entry.isDirectory() ? SKIP_DIRS.has(entry.name) : !isScannedFile(entry.name)),
  });
}

const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*|#)/;
const FLAG_RES = AUTO_APPROVE.map((flag) => [flag, new RegExp(`(?<![\\w-])${flag}(?![\\w-])`)]);

/** Flags a file's code (not its comments) carries. A comment that names a
 *  flag to warn against it — clis.ts, salary-gap.mjs — is not a grant. */
function flagsIn(text) {
  const found = new Set();
  for (const line of text.split('\n')) {
    if (COMMENT_LINE.test(line)) continue;
    for (const [flag, re] of FLAG_RES) if (re.test(line)) found.add(flag);
  }
  return found;
}

function discover() {
  const hits = new Map();
  for (const file of codeFiles()) {
    const flags = flagsIn(readFileSync(file, 'utf8'));
    if (flags.size) hits.set(relative(ROOT, file).split(sep).join('/'), [...flags]);
  }
  return hits;
}

const hits = discover();

test('the scan sees the spawners it is meant to see', () => {
  // Without this, a walk that silently skipped batch/ (or a regex that stopped
  // matching) would pass by finding nothing at all.
  assert.ok(hits.has('batch-tailor.mjs'),
    `batch-tailor.mjs not discovered — found: ${[...hits.keys()].join(', ') || '(none)'}`);
});

test('no file outside KNOWN passes a blanket auto-approve flag', () => {
  const unexpected = [...hits].filter(([file]) => !KNOWN.has(file))
    .map(([file, flags]) => `${file} (${flags.join(', ')})`);
  assert.deepEqual(unexpected, [],
    `new blanket-approval grant(s): ${unexpected.join('; ')}. A headless worker may not get more write power than the web grants it — see "Headless worker permissions" in AGENTS.md. If a CLI cannot express the web's deny list, withhold the writing workers from it instead.`);
});

test('every KNOWN entry still passes a flag (the list cannot outlive the debt)', () => {
  // web/ is its own release-please component and can be absent on an
  // upgraded install (#3269); its entry is then not stale, just not here.
  const stale = [...KNOWN.keys()].filter((file) => !hits.has(file)
    && !(file.startsWith('web/') && !existsSync(join(ROOT, 'web'))));
  assert.deepEqual(stale, [],
    `KNOWN lists ${stale.join(', ')} but no flag was found there — remove the entry so the allowance does not outlive the fix`);
});

test('the guard actually fires (mutation check)', () => {
  const spawner = "spawnSync('claude', ['-p', '--always-approve', prompt]);";
  assert.deepEqual([...flagsIn(spawner)], ['--always-approve']);
  // ...and a comment naming the flag, or a longer flag sharing its prefix, does not.
  assert.equal(flagsIn('// never pass --yolo here').size, 0);
  assert.equal(flagsIn("args.push('--yolo-mode-docs')").size, 0);
});
