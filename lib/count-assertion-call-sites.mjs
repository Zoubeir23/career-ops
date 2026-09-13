// lib/count-assertion-call-sites.mjs — a rough, hedged estimate of how many
// pass()/fail() call sites a discovered test suite's source contains.
//
// Used by test-all.mjs's runDiscovered() to size how much a mid-import throw
// silently cost (career-ops#3976): a contained throw is reported as exactly
// one failure, with nothing saying how many assertions after it never ran —
// on one platform a suite's crash reads as one broken assertion, on another
// the same file's assertions run and pass, and the two summaries can look the
// same shape.
//
// Deliberately approximate, not an execution trace: a suite that calls
// pass()/fail() inside a loop has more real assertions than call sites, and
// one that only ever calls them from inside a helper has fewer.
//
// Lives in lib/, not test-all.mjs itself: a test file that needs this
// function to test it must import it from somewhere, and importing
// test-all.mjs as a module would re-run its entire top-level suite as a side
// effect of the import (it is a script, not a library, everywhere else) — the
// exact kind of self-recursion a test importing it would trigger the moment
// it got discovered and imported in turn.

// Drops comments AND string/template-literal TEXT before counting, not just
// comments: a bare `.match(/pass\(/g)` also fires on the text "pass(" sitting
// inside a string argument — a doc-style message, a URL, an error string
// quoting code — which would inflate the estimate past what the file can
// actually execute. String contents are replaced with a single space rather
// than removed outright, so `pass('a')pass('b')` on one line (contrived, but
// the boundary this guards) does not get its two calls fused into one match
// by deleting the separator between them.
//
// A template literal's `${...}` interpolations are executable code, not
// text — `` `${pass('inline')}` `` really does call pass() — so they are
// scanned like code (comments, quotes, and further nested templates all
// apply inside one), while the literal text around them is dropped like any
// other string content (CodeRabbit, #3976 review). The stack tracks
// arbitrarily nested templates-inside-interpolations-inside-templates; each
// frame is 'template' (consuming raw text) or 'interp' with a brace depth
// (scanning as code until ITS OWN unmatched `}` closes the interpolation and
// returns to that frame's enclosing template text).
//
// Simplified relative to a full tokenizer: escapes inside a string/template
// are skipped without being preserved (content is discarded either way), and
// `/` is never treated as a regex-literal opener — a regex containing the
// literal text "pass(" is not a realistic false positive for this codebase's
// test files, so the division/regex ambiguity a full scanner has to resolve
// is not worth carrying here.
function stripCommentsAndStrings(src) {
  let out = '';
  let quote = null; // "'" | '"' when inside a single/double-quoted string
  let block = false; // inside a /* */ comment
  let line = false; // inside a // comment
  const templates = []; // stack of { kind: 'template' } | { kind: 'interp', depth }

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];
    const top = templates[templates.length - 1];

    if (line) {
      if (c === '\n') { line = false; out += c; }
      continue;
    }
    if (block) {
      if (c === '*' && next === '/') { block = false; i++; }
      continue;
    }
    if (quote) {
      if (c === '\\') { i++; continue; } // drop the escape and the char it escapes
      if (c === quote) { quote = null; out += ' '; }
      continue;
    }
    if (top && top.kind === 'template') {
      // Raw template text: dropped like any other string content, except a
      // `${` switches this frame to scanning the interpolation as code.
      if (c === '\\') { i++; continue; }
      if (c === '`') { templates.pop(); out += ' '; continue; }
      if (c === '$' && next === '{') { top.kind = 'interp'; top.depth = 1; out += ' '; i++; continue; }
      continue;
    }
    // CODE — either top-level, or inside a template's `${...}` interpolation
    // (top?.kind === 'interp'). Comments, quotes, and nested templates apply
    // identically in both; the only extra rule inside an interpolation is
    // tracking brace depth so its own (not a nested block's) `}` closes it.
    if (c === '/' && next === '/') { line = true; continue; }
    if (c === '/' && next === '*') { block = true; i++; continue; }
    if (c === '"' || c === "'") { quote = c; out += ' '; continue; }
    if (c === '`') { templates.push({ kind: 'template' }); out += ' '; continue; }
    if (top && top.kind === 'interp') {
      if (c === '{') top.depth += 1;
      else if (c === '}') {
        top.depth -= 1;
        if (top.depth === 0) {
          templates.pop();
          templates.push({ kind: 'template' });
          out += ' ';
          continue;
        }
      }
    }
    out += c;
  }
  return out;
}

export function countAssertionCallSites(src) {
  const stripped = stripCommentsAndStrings(src);
  return (stripped.match(/\b(?:pass|fail)\s*\(/g) || []).length;
}
