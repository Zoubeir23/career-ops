// tests/providers/mycareersfuture.test.mjs
import { pass, fail, ROOT } from '../helpers.mjs';
import { join } from 'path';
import { pathToFileURL } from 'url';

console.log('\nProvider — mycareersfuture');

try {
  const mod = await import(pathToFileURL(join(ROOT, 'providers/mycareersfuture.mjs')).href);
  const mycareersfuture = mod.default;
  const { parseConfig, cleanUrl, normalizeJob } = mod;

  if (mycareersfuture.id === 'mycareersfuture') pass('mycareersfuture.id is "mycareersfuture"');
  else fail(`mycareersfuture.id is ${JSON.stringify(mycareersfuture.id)}`);

  const hit = mycareersfuture.detect({ name: 'MCF', provider: 'mycareersfuture' });
  if (hit && hit.url === 'https://api.mycareersfuture.gov.sg/v2/search') {
    pass('mycareersfuture.detect() claims explicit provider config');
  } else {
    fail(`mycareersfuture.detect() returned ${JSON.stringify(hit)}`);
  }

  if (mycareersfuture.detect({ name: 'Other', provider: 'vdab' }) === null) {
    pass('mycareersfuture.detect() ignores other provider ids');
  } else {
    fail('mycareersfuture.detect() should only claim provider: mycareersfuture');
  }

  // ── parseConfig ──
  if (JSON.stringify(parseConfig({ mycareersfuture: { keywords: [' engineer ', 'nurse', '', 42] } }).keywords)
    === JSON.stringify(['engineer', 'nurse'])) {
    pass('parseConfig trims keywords and drops blank/non-string entries');
  } else {
    fail(`parseConfig returned ${JSON.stringify(parseConfig({ mycareersfuture: { keywords: [' engineer ', 'nurse', '', 42] } }))}`);
  }

  if (parseConfig({}).keywords.length === 0 && parseConfig({ mycareersfuture: {} }).keywords.length === 0) {
    pass('parseConfig defaults to no keywords when the block or array is absent');
  } else {
    fail('parseConfig should default to an empty keywords array');
  }

  if (parseConfig({ mycareersfuture: { size: 500 } }).size === 100) {
    pass('parseConfig clamps size down to the server-enforced 100 ceiling');
  } else {
    fail(`parseConfig({ size: 500 }).size = ${parseConfig({ mycareersfuture: { size: 500 } }).size} (expected 100)`);
  }

  if (parseConfig({}).size === 100) {
    pass('parseConfig defaults size to 100 (the max page size) when unset');
  } else {
    fail(`parseConfig({}).size = ${parseConfig({}).size} (expected 100)`);
  }

  if (parseConfig({ max_pages: 100 }).maxPages === 20) {
    pass('parseConfig clamps max_pages down to MAX_PAGES_CAP (20)');
  } else {
    fail(`parseConfig({ max_pages: 100 }).maxPages = ${parseConfig({ max_pages: 100 }).maxPages} (expected 20)`);
  }

  if (parseConfig({}).maxPages === 5) {
    pass('parseConfig defaults max_pages to 5 when unset');
  } else {
    fail(`parseConfig({}).maxPages = ${parseConfig({}).maxPages} (expected 5)`);
  }
} catch (e) {
  fail(`mycareersfuture provider tests crashed: ${e.message}`);
}
