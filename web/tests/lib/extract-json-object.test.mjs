// extractJsonObject salvages the largest valid prefix of a truncated LLM
// answer (apply/prefill/route.ts). Factored into its own .mjs specifically so
// it can be exercised directly here — no @/ alias, no Node-only deps.
//
// Covers the bug: the truncation-salvage path used to compute the closing
// "pad" ONCE from the whole (broken) fragment's brace count, then reuse that
// same pad for every backtracked candidate. An earlier field almost never
// needs the same nesting depth as the full truncated tail, so the pad was
// wrong for every candidate except by coincidence — the loop exhausted every
// comma and returned null, discarding every field that DID finish along with
// the one that didn't.
//
// Run:  node --test tests/lib/extract-json-object.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJsonObject } from "../../src/lib/extract-json-object.mjs";

test("a complete, well-formed object parses normally (not the truncation path)", () => {
  const { obj, truncated } = extractJsonObject('{"a": {"value": "x", "needs_confirmation": false}}');
  assert.deepEqual(obj, { a: { value: "x", needs_confirmation: false } });
  assert.equal(truncated, false);
});

test("strips code fences before locating the object", () => {
  const { obj } = extractJsonObject('```json\n{"a": {"value": "x"}}\n```');
  assert.deepEqual(obj, { a: { value: "x" } });
});

test("the reported bug: an earlier COMPLETE field must survive a later field truncated at a DEEPER nesting level", () => {
  // "name" is fully closed. "about_you" is a free-text field whose value text
  // happens to mention brace-heavy content (config examples, code) and gets
  // killed mid-string at a deeper nesting level than "name" ever reached.
  const truncated =
    '{"name": {"value": "Jane Doe", "needs_confirmation": false}, ' +
    '"about_you": {"value": "I build systems using patterns like {config: {nested: true';
  const { obj, truncated: wasTruncated } = extractJsonObject(truncated);
  assert.notEqual(obj, null, "the complete earlier field must not be lost just because a later field was cut deeper");
  assert.deepEqual(obj, { name: { value: "Jane Doe", needs_confirmation: false } });
  assert.equal(wasTruncated, true);
});

test("truncation mid-way through a single field's value: the field itself is unrecoverable, returns null", () => {
  const { obj, truncated } = extractJsonObject('{"a": {"value": "x');
  assert.equal(obj, null);
  assert.equal(truncated, true);
});

test("multiple recoverable fields at different nesting depths all survive", () => {
  const truncated =
    '{"a": {"value": "x", "needs_confirmation": false}, ' +
    '"b": {"value": "y"}, ' +
    '"c": {"value": {"deep": {"deeper": "z"}}}, ' +
    '"d": {"value": "cut off mid';
  const { obj, truncated: wasTruncated } = extractJsonObject(truncated);
  assert.deepEqual(obj, {
    a: { value: "x", needs_confirmation: false },
    b: { value: "y" },
    c: { value: { deep: { deeper: "z" } } },
  });
  assert.equal(wasTruncated, true);
});

test("no opening brace at all returns null, not truncated", () => {
  const { obj, truncated } = extractJsonObject("just some prose, no JSON here");
  assert.equal(obj, null);
  assert.equal(truncated, false);
});

test("an unbalanced fragment with nothing recoverable before the first field returns null cleanly", () => {
  const { obj, truncated } = extractJsonObject('{"a": {"b"');
  assert.equal(obj, null);
  assert.equal(truncated, true);
});
