// @ts-check
/** @typedef {import('./_types.js').Provider} Provider */

// MyCareersFuture provider — Singapore's national job bank, run by Workforce
// Singapore (WSG, a statutory board under the Ministry of Manpower). Same
// class as arbeitsagentur.mjs/vdab.mjs/jobbankca.mjs: a high-volume public
// employment service, no login, no API key — confirmed by a cold,
// unauthenticated POST (fetched 2026-08-21) against the same public search
// endpoint mycareersfuture.gov.sg's own frontend uses.
//
// Wire in via a `job_boards` entry with `provider: mycareersfuture` and a
// `mycareersfuture:` block:
//
//   - name: MyCareersFuture — Software Engineering
//     provider: mycareersfuture
//     mycareersfuture:
//       # keywords optional: falls back to config/profile.yml's target_roles
//       # (primary[] + archetypes[].name) when omitted, same as vdab.mjs.
//       keywords: ["software engineer", "backend developer"]
//     enabled: true
//
// PUBLIC API, NO AUTH. `www.mycareersfuture.gov.sg/robots.txt` (fetched
// 2026-08-21) allows everything and sets no Crawl-delay:
//   User-agent: *
//   Disallow:
// so unlike jobbankca.mjs's robots.txt-mandated 5s, no forced inter-request
// delay is added here.
//
// Pagination is controlled by the QUERY STRING `page` param, not the JSON
// body's `page` field — confirmed by execution: holding the query string's
// page fixed while varying only body.page returned identical results every
// time; varying the query string's page returned different jobs. The body's
// `page` key is still sent (mirrors the site's own frontend request shape),
// but must never be relied on to advance pages.
//
// `limit` (page size) is server-validated at <= 100 — a >100 request 400s
// with a clear "must be <= 100" message, confirmed by execution — so SIZE
// below is clamped to that ceiling.
//
// The self-identifying DEFAULT_USER_AGENT (from _http.mjs) is left as-is
// rather than swapped for BROWSER_LIKE_USER_AGENT: a live request carrying it
// verbatim returned 200 with no WAF friction, so there is no reason to
// impersonate a browser against a government API that already answers an
// honest bot identifier.

import { intInRange } from './_config-utils.mjs';

const MAX_PAGE_SIZE = 100; // server-enforced ceiling, confirmed by execution
const DEFAULT_MAX_PAGES = 5; // 5 x 100 = 500 postings/keyword before over-fetch stops paying off
const MAX_PAGES_CAP = 20; // hard ceiling regardless of entry.max_pages / ctx.maxPages misconfiguration

/**
 * Reads and sanitizes the entry's `mycareersfuture:` config block, plus the
 * shared `max_pages` field (same key jobbankca.mjs/workday.mjs use).
 * @param {{ mycareersfuture?: any, max_pages?: unknown }} entry
 * @returns {{ keywords: string[], size: number, maxPages: number }}
 */
export function parseConfig(entry) {
  const cfg = (entry && entry.mycareersfuture) || {};
  const keywords = [...new Set(
    (Array.isArray(cfg.keywords) ? cfg.keywords : [])
      .filter((k) => typeof k === 'string' && k.trim())
      .map((k) => k.trim()),
  )];
  return {
    keywords,
    size: intInRange(cfg.size, MAX_PAGE_SIZE, 1, MAX_PAGE_SIZE),
    maxPages: Math.min(intInRange(entry && entry.max_pages, DEFAULT_MAX_PAGES, 1, MAX_PAGES_CAP), MAX_PAGES_CAP),
  };
}

const TRUSTED_JOB_HOST = 'www.mycareersfuture.gov.sg';

/**
 * Cleans and host-locks a job detail URL straight from the API response —
 * defense in depth against the API ever returning (or being tricked into
 * returning) an off-host URL, the same discipline jobbankca.mjs applies to
 * its Atom `<link href>`.
 * @param {unknown} value
 * @returns {string}
 */
export function cleanUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'https:' && parsed.hostname === TRUSTED_JOB_HOST ? parsed.href : '';
  } catch {
    return '';
  }
}

/**
 * Normalizes one raw `results[]` record into a Job plus its jobPostId (kept
 * for dedup, stripped before the provider returns it). Returns null when the
 * posting lacks a usable id, title, or trusted url.
 *
 * `company` prefers `hiringCompany` (the real employer) over `postedCompany`
 * (the poster, which is a recruitment agency when `isPostedOnBehalf` is
 * true) — confirmed live samples never populated `hiringCompany`, but the
 * schema clearly reserves it for exactly this case, so preferring it costs
 * nothing on the common path and gets the right answer on the uncommon one.
 * @param {any} r
 * @returns {({title: string, url: string, company: string, location: string, postedAt?: number, id: string}) | null}
 */
export function normalizeJob(r) {
  const id = r && r.metadata && r.metadata.jobPostId;
  const title = String((r && r.title) || '').trim();
  const url = cleanUrl(r && r.metadata && r.metadata.jobDetailsUrl);
  if (!id || !title || !url) return null;
  const company = String(
    (r.hiringCompany && r.hiringCompany.name)
    || (r.postedCompany && r.postedCompany.name)
    || '',
  ).trim();
  const districts = Array.isArray(r.address && r.address.districts) ? r.address.districts : [];
  const location = districts.map((d) => d && d.location).filter(Boolean).join(', ');
  const result = { title, url, company, location, id: String(id) };
  const posted = Date.parse((r.metadata && r.metadata.newPostingDate) || '');
  if (Number.isFinite(posted)) result.postedAt = posted;
  return result;
}
