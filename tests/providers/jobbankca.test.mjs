// tests/providers/jobbankca.test.mjs
import { pass, fail, ROOT } from '../helpers.mjs';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';

console.log('\nProvider — jobbankca');

try {
  const mod = await import(pathToFileURL(join(ROOT, 'providers/jobbankca.mjs')).href);
  const jobbankca = mod.default;
  const { parseJobBankFeed, parseJobBankConfig, buildFeedUrl } = mod;

  if (jobbankca.id === 'jobbankca') pass('jobbankca.id is "jobbankca"');
  else fail(`jobbankca.id is ${JSON.stringify(jobbankca.id)}`);

  const hit = jobbankca.detect({ name: 'Job Bank', provider: 'jobbankca' });
  if (hit && hit.url === 'https://www.jobbank.gc.ca/jobsearch/feed/jobSearchRSSfeed') {
    pass('jobbankca.detect() claims explicit provider config');
  } else {
    fail(`jobbankca.detect() returned ${JSON.stringify(hit)}`);
  }

  if (jobbankca.detect({ name: 'Other', provider: 'arbeitsagentur' }) === null) {
    pass('jobbankca.detect() ignores other provider ids');
  } else {
    fail('jobbankca.detect() should only claim provider: jobbankca');
  }

  // ── parseJobBankConfig ──
  if (JSON.stringify(parseJobBankConfig({ jobbankca: { keywords: [' engineer ', 'nurse', '', 42] } }))
    === JSON.stringify({ keywords: ['engineer', 'nurse'] })) {
    pass('parseJobBankConfig trims keywords and drops blank/non-string entries');
  } else {
    fail(`parseJobBankConfig returned ${JSON.stringify(parseJobBankConfig({ jobbankca: { keywords: [' engineer ', 'nurse', '', 42] } }))}`);
  }

  if (parseJobBankConfig({}).keywords.length === 0 && parseJobBankConfig({ jobbankca: {} }).keywords.length === 0) {
    pass('parseJobBankConfig defaults to no keywords when the block or array is absent');
  } else {
    fail('parseJobBankConfig should default to an empty keywords array');
  }

  // ── buildFeedUrl ──
  const built = new URL(buildFeedUrl('backend developer', 2));
  if (
    built.origin + built.pathname === 'https://www.jobbank.gc.ca/jobsearch/feed/jobSearchRSSfeed'
    && built.searchParams.get('searchstring') === 'backend developer'
    && built.searchParams.get('page') === '2'
    && built.searchParams.get('locationstring') === ''
  ) {
    pass('buildFeedUrl builds the pinned feed URL with searchstring/page/locationstring');
  } else {
    fail(`buildFeedUrl returned ${buildFeedUrl('backend developer', 2)}`);
  }

  // ── parseJobBankFeed — fixture captured 2026-08-20 from the real public feed,
  // trimmed to the shapes worth asserting on. ──
  const sample = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en">
	<title><![CDATA[developer - Job Bank]]></title>
	<id>https://www.jobbank.gc.ca/jobsearch/jobSearchRSSfeed</id>
	<link rel="self" type="application/atom+xml" href="https://www.jobbank.gc.ca/jobsearch/jobSearchRSSfeed?searchstring=developer&amp;locationstring="/>
	<updated>2026-08-20T23:26:37Z</updated>
	<author><name>Job Bank</name></author>
	<logo>/images/sig_eng.gif</logo>
	<entry>
		<title type="html"><![CDATA[devops engineer]]></title>
		<link rel="alternate" type="text/html" href="https://www.jobbank.gc.ca/jobsearch/jobposting/50123456"/>
		<id>https://www.jobbank.gc.ca/jobsearch/jobSearchRSSfeed?id=10236614247</id>
		<updated>2026-08-20T17:00:00Z</updated>
		<summary type="html"><![CDATA[<strong>Job number:</strong> 10236614247<br /><strong>Location:</strong> Vancouver (BC)  <br /><strong>Employer:</strong> Telescope Innovations Corp<br /><strong>Salary:</strong> $100,000.00 to $140,000.00 annually]]></summary>
	</entry>
	<entry>
		<title type="html">data analyst, R&amp;D</title>
		<link rel="alternate" type="text/html" href="https://www.jobbank.gc.ca/jobsearch/jobposting/50120001"/>
		<id>https://www.jobbank.gc.ca/jobsearch/jobSearchRSSfeed?id=17460900</id>
		<updated>2026-08-20T09:00:00Z</updated>
		<summary type="html"><![CDATA[<strong>Job number:</strong> 17460900<br /><strong>Location:</strong> Montréal (QC)  <br /><strong>Employer:</strong> Data Co]]></summary>
	</entry>
	<entry>
		<title type="html"><![CDATA[dropped: no link]]></title>
		<id>https://www.jobbank.gc.ca/jobsearch/jobSearchRSSfeed?id=999</id>
		<updated>2026-08-20T08:00:00Z</updated>
		<summary type="html"><![CDATA[<strong>Location:</strong> Nowhere]]></summary>
	</entry>
	<entry>
		<link rel="alternate" type="text/html" href="https://www.jobbank.gc.ca/jobsearch/jobposting/50120002"/>
		<id>https://www.jobbank.gc.ca/jobsearch/jobSearchRSSfeed?id=998</id>
		<updated>2026-08-20T08:00:00Z</updated>
		<summary type="html"><![CDATA[dropped: no title]]></summary>
	</entry>
	<entry>
		<title type="html"><![CDATA[dropped: off-host link]]></title>
		<link rel="alternate" type="text/html" href="https://example.com/jobsearch/jobposting/1"/>
		<id>https://www.jobbank.gc.ca/jobsearch/jobSearchRSSfeed?id=997</id>
		<updated>2026-08-20T08:00:00Z</updated>
		<summary type="html"><![CDATA[<strong>Location:</strong> Elsewhere]]></summary>
	</entry>
</feed>`;

  const jobs = parseJobBankFeed(sample);

  if (jobs.length === 2) pass('parseJobBankFeed keeps 2 entries (drops missing-link/title/off-host)');
  else fail(`parseJobBankFeed returned ${jobs.length} jobs (expected 2): ${JSON.stringify(jobs)}`);

  if (jobs[0]?.title === 'devops engineer' && jobs[0]?.company === 'Telescope Innovations Corp' && jobs[0]?.location === 'Vancouver (BC)') {
    pass('parseJobBankFeed extracts title/company/location from the summary CDATA');
  } else {
    fail(`row 0 = ${JSON.stringify(jobs[0])}`);
  }

  if (jobs[0]?.url === 'https://www.jobbank.gc.ca/jobsearch/jobposting/50123456') {
    pass('parseJobBankFeed maps the Atom <link href> to url, not inner text');
  } else {
    fail(`row 0 url = ${JSON.stringify(jobs[0]?.url)}`);
  }

  if (jobs[0]?.postedAt === Date.parse('2026-08-20T17:00:00Z')) {
    pass('parseJobBankFeed parses <updated> to postedAt');
  } else {
    fail(`row 0 postedAt = ${JSON.stringify(jobs[0]?.postedAt)}`);
  }

  if (jobs[1]?.title === 'data analyst, R&D') {
    pass('parseJobBankFeed decodes entities in the title (R&amp;D -> R&D)');
  } else {
    fail(`row 1 title = ${JSON.stringify(jobs[1]?.title)}`);
  }

  if (jobs[1]?.location === 'Montréal (QC)' && jobs[1]?.company === 'Data Co') {
    pass('parseJobBankFeed extracts fields correctly when Salary is absent (label order preserved)');
  } else {
    fail(`row 1 = ${JSON.stringify(jobs[1])}`);
  }

  if (parseJobBankFeed('').length === 0 && parseJobBankFeed(null).length === 0 && parseJobBankFeed(undefined).length === 0) {
    pass('parseJobBankFeed empty / non-string feed -> empty result (no crash)');
  } else {
    fail('parseJobBankFeed empty / non-string feed should yield empty result');
  }

  // ── fetch(): keyword requirement + config/profile.yml fallback. Runs in an
  // isolated tmp cwd (never this checkout's own config/profile.yml, so the
  // test is hermetic regardless of whether the checkout is onboarded) —
  // same pattern as tests/providers/vdab.test.mjs. ──
  {
    const withTmpCwd = async (setup, run) => {
      const tmp = mkdtempSync(join(tmpdir(), 'career-ops-jobbankca-fallback-'));
      const cwdBefore = process.cwd();
      try {
        setup(tmp);
        process.chdir(tmp);
        return await run();
      } finally {
        process.chdir(cwdBefore);
      }
    };

    // No entry keywords, but a profile.yml with target_roles → falls back.
    let sentSearchstring = null;
    await withTmpCwd(
      (tmp) => {
        mkdirSync(join(tmp, 'config'));
        writeFileSync(join(tmp, 'config', 'profile.yml'), 'target_roles:\n  primary:\n    - Data Engineer\n');
      },
      () => jobbankca.fetch(
        { provider: 'jobbankca', name: 'No own keywords' },
        {
          sleep: async () => {},
          fetchText: async (url) => { sentSearchstring = new URL(url).searchParams.get('searchstring'); return '<?xml version="1.0"?><feed></feed>'; },
        },
      ),
    );
    if (sentSearchstring === 'Data Engineer') {
      pass('jobbankca.fetch() falls back to config/profile.yml target_roles when jobbankca.keywords[] is empty');
    } else {
      fail(`jobbankca.fetch() fallback searchstring = ${JSON.stringify(sentSearchstring)}`);
    }

    // No entry keywords AND no profile.yml at all → throws.
    let threwNoKeywords = false;
    let threwMessage = '';
    try {
      await withTmpCwd(
        () => {}, // no config/ dir created — profile.yml genuinely absent
        () => jobbankca.fetch({ provider: 'jobbankca', name: 'No Keywords' }, { fetchText: async () => '', sleep: async () => {} }),
      );
    } catch (err) {
      threwNoKeywords = true;
      threwMessage = err.message;
    }
    if (threwNoKeywords && /no jobbankca\.keywords/.test(threwMessage)) {
      pass('jobbankca.fetch() throws a clear error when no keywords and no profile.yml fallback are available');
    } else {
      fail(`jobbankca.fetch() should throw when no keywords are available from any source, got: threw=${threwNoKeywords} message=${JSON.stringify(threwMessage)}`);
    }
  }

  // ── fetch(): pagination stops on a short page, dedups across keywords ──
  {
    const fullPage = Array.from({ length: 100 }, (_, i) => `\t<entry>
		<title><![CDATA[role ${i}]]></title>
		<link rel="alternate" type="text/html" href="https://www.jobbank.gc.ca/jobsearch/jobposting/${i}"/>
		<id>id-${i}</id>
		<updated>2026-08-20T08:00:00Z</updated>
		<summary><![CDATA[<strong>Location:</strong> X]]></summary>
	</entry>`).join('\n');
    const shortPage = `\t<entry>
		<title><![CDATA[role 100]]></title>
		<link rel="alternate" type="text/html" href="https://www.jobbank.gc.ca/jobsearch/jobposting/100"/>
		<id>id-100</id>
		<updated>2026-08-20T08:00:00Z</updated>
		<summary><![CDATA[<strong>Location:</strong> X]]></summary>
	</entry>`;
    const feed = (body) => `<?xml version="1.0"?><feed>${body}</feed>`;

    const requested = [];
    let slept = 0;
    const fetched = await jobbankca.fetch(
      { provider: 'jobbankca', name: 'Full page test', jobbankca: { keywords: ['developer'] } },
      {
        maxPages: undefined,
        sleep: async (ms) => { slept += ms; },
        fetchText: async (url) => {
          requested.push(url);
          const page = new URL(url).searchParams.get('page');
          return page === '1' ? feed(fullPage) : feed(shortPage);
        },
      },
    );

    if (requested.length === 2) pass('jobbankca.fetch() paginates: a full (100-entry) page requests the next one');
    else fail(`jobbankca.fetch() made ${requested.length} requests (expected 2): ${JSON.stringify(requested)}`);

    if (fetched.length === 101) pass('jobbankca.fetch() stops after a short page and returns all collected jobs');
    else fail(`jobbankca.fetch() returned ${fetched.length} jobs (expected 101)`);

    if (slept >= 2 * 5000) pass('jobbankca.fetch() sleeps at least 5000ms (robots.txt Crawl-delay) before each request');
    else fail(`jobbankca.fetch() only slept ${slept}ms total for 2 requests`);
  }

  // ── fetch(): entry.max_pages configures the run, ctx.maxPages only caps it ──
  {
    const feed = (n) => `<?xml version="1.0"?><feed>${Array.from({ length: n }, (_, i) => `<entry><title><![CDATA[r${i}]]></title><link rel="alternate" href="https://www.jobbank.gc.ca/jobsearch/jobposting/${i}"/><id>${i}</id><updated>2026-08-20T08:00:00Z</updated><summary><![CDATA[x]]></summary></entry>`).join('')}</feed>`;
    const requested = [];
    const capped = await jobbankca.fetch(
      { provider: 'jobbankca', name: 'Capped', jobbankca: { keywords: ['x'] }, max_pages: 3 },
      {
        maxPages: 1, // a health-probe-style cap
        sleep: async () => {},
        fetchText: async (url) => { requested.push(url); return feed(100); },
      },
    );
    if (requested.length === 1) pass('jobbankca.fetch(): ctx.maxPages caps entry.max_pages, not the other way around');
    else fail(`jobbankca.fetch() made ${requested.length} requests under ctx.maxPages=1 (expected 1)`);
  }

  // ── fetch(): recall-first — one failed keyword does not abort the others ──
  {
    const feed = `<?xml version="1.0"?><feed><entry><title><![CDATA[ok]]></title><link rel="alternate" href="https://www.jobbank.gc.ca/jobsearch/jobposting/1"/><id>1</id><updated>2026-08-20T08:00:00Z</updated><summary><![CDATA[x]]></summary></entry></feed>`;
    const fetched = await jobbankca.fetch(
      { provider: 'jobbankca', name: 'Partial failure', jobbankca: { keywords: ['bad', 'good'] } },
      {
        sleep: async () => {},
        fetchText: async (url) => {
          if (url.includes('searchstring=bad')) throw new Error('network error');
          return feed;
        },
      },
    );
    if (fetched.length === 1 && fetched[0].title === 'ok') {
      pass('jobbankca.fetch(): a failed keyword does not abort keywords that still succeed');
    } else {
      fail(`jobbankca.fetch() with one failing keyword returned ${JSON.stringify(fetched)}`);
    }
  }

  // ── fetch(): total outage throws ──
  try {
    await jobbankca.fetch(
      { provider: 'jobbankca', name: 'Outage', jobbankca: { keywords: ['a', 'b'] } },
      { sleep: async () => {}, fetchText: async () => { throw new Error('boom'); } },
    );
    fail('jobbankca.fetch() should throw when every keyword request fails');
  } catch (err) {
    if (/all 2 keyword request\(s\) failed/.test(err.message)) pass('jobbankca.fetch() throws when every keyword fails (total outage)');
    else fail(`jobbankca.fetch() threw an unexpected error on total outage: ${err.message}`);
  }

  // ── fetch(): request hygiene ──
  {
    let capturedOpts = null;
    await jobbankca.fetch(
      { provider: 'jobbankca', name: 'Hygiene', jobbankca: { keywords: ['x'] } },
      {
        sleep: async () => {},
        fetchText: async (url, opts) => { capturedOpts = opts; return '<?xml version="1.0"?><feed></feed>'; },
      },
    );
    if (capturedOpts && capturedOpts.redirect === 'error') {
      pass('jobbankca.fetch() passes redirect:"error" to fetchText (SSRF-via-redirect guard)');
    } else {
      fail(`jobbankca.fetch() should pass redirect:"error", got: ${JSON.stringify(capturedOpts)}`);
    }
    if (capturedOpts && capturedOpts.headers && capturedOpts.headers['User-Agent']) {
      pass('jobbankca.fetch() sends a User-Agent header');
    } else {
      fail(`jobbankca.fetch() should send a User-Agent header, got: ${JSON.stringify(capturedOpts)}`);
    }
  }
} catch (e) {
  fail(`jobbankca provider tests crashed: ${e.message}`);
}
