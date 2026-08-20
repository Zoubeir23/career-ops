/**
 * extract-json-object.mjs — pull a JSON object out of an LLM's text answer,
 * tolerating code fences, trailing prose, and — crucially — TRUNCATION (the
 * planner getting killed mid-output on a big form). When the object is
 * incomplete we salvage the largest valid prefix so the fields that DID
 * finish still come through (apply/prefill/route.ts).
 *
 * Plain .mjs (same pattern as pdf-paths.mjs / clean-chips.mjs) so this can be
 * unit-tested with `node --test`, no TypeScript build step — it has no `@/`
 * dependency, so factoring it out of the route is what makes it testable at
 * all.
 */

/**
 * @typedef {Object} ExtractedJson
 * @property {Record<string, unknown> | null} obj
 * @property {boolean} truncated
 */

/**
 * @param {string} text
 * @returns {ExtractedJson}
 */
export function extractJsonObject(text) {
  const s = text.replace(/```(?:json)?/gi, "");
  const start = s.indexOf("{");
  if (start === -1) return { obj: null, truncated: false };

  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end !== -1) {
    try {
      return { obj: JSON.parse(s.slice(start, end + 1)), truncated: false };
    } catch {
      /* malformed even though balanced — fall through to salvage */
    }
  }

  // Truncated / unbalanced: walk back from successive commas, close the JSON,
  // and parse the largest prefix that is valid.
  //
  // Each candidate prefix gets ITS OWN pad, computed from that prefix's own
  // open/close count — not the whole fragment's. An earlier field is usually
  // closed at a shallower depth than whatever the truncated tail was mid-way
  // through, so a pad sized for the full (broken) fragment almost never
  // matches what an earlier, complete field needs to close. Reusing one fixed
  // pad for every backtrack candidate meant a mismatch on any candidate whose
  // depth didn't happen to equal the full fragment's — i.e. almost always —
  // so the loop silently exhausted every comma and returned null, discarding
  // every field that DID finish along with the one that didn't.
  const frag = s.slice(start);
  for (let tryEnd = frag.length; tryEnd > 1; ) {
    const body = frag.slice(0, tryEnd).replace(/,\s*$/, "");
    const open = (body.match(/{/g) || []).length;
    const close = (body.match(/}/g) || []).length;
    const pad = "}".repeat(Math.max(0, open - close));
    try {
      return { obj: JSON.parse(body + pad), truncated: true };
    } catch {
      const prevComma = frag.lastIndexOf(",", tryEnd - 1);
      if (prevComma <= start) break;
      tryEnd = prevComma;
    }
  }
  return { obj: null, truncated: true };
}
