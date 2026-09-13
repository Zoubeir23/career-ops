// tests/count-assertion-call-sites.test.mjs — lib/count-assertion-call-sites.mjs
// (career-ops#3976).
//
// Pure-function unit coverage only, deliberately: the integration behavior
// (runDiscovered() reporting this estimate when a discovered suite throws
// mid-import) was verified manually by dropping the issue's own repro fixture
// into tests/, running `node test-all.mjs --only <fixture>`, and confirming
// the "N of ~M ... never executed" line, then deleting it — the exact
// leftover-scratch-file risk class #3940 warns about (a fixture left in the
// real tests/ dir turns the NEXT run red) is why that path isn't automated
// here as a self-referential test-all.mjs-in-test-all.mjs run.
import { pass, fail } from './helpers.mjs';
import { countAssertionCallSites } from '../lib/count-assertion-call-sites.mjs';

console.log('\nlib/count-assertion-call-sites.mjs (#3976)');

function expectCount(label, src, expected) {
  const got = countAssertionCallSites(src);
  if (got === expected) {
    pass(label);
  } else {
    fail(`${label}: expected ${expected}, got ${got}`);
  }
}

expectCount(
  "the issue's own repro (5 pass() calls) counts as 5",
  "pass('assertion 1 of 5');\npass('assertion 2 of 5');\nthrow new Error('x');\npass('assertion 3 of 5');\npass('assertion 4 of 5');\npass('assertion 5 of 5');",
  5,
);

expectCount('a mix of pass( and fail( call sites are both counted', "pass('a');\nfail('b');\npass('c');", 3);

expectCount(
  'a // line comment mentioning pass( is not counted',
  "pass('real');\n// call pass('like this') for a doc example\npass('also real');",
  2,
);

expectCount(
  'a /* block comment */ mentioning fail( is not counted',
  "pass('real');\n/* fail('inside a block comment') */\npass('also real');",
  2,
);

expectCount('a file with no assertions counts as 0', "console.log('nothing to assert here');", 0);

expectCount(
  'a URL containing "://" inside a string is not misread as a comment start',
  "pass('see https://example.com/pass(fake) for details');\npass('second');",
  2,
);

expectCount(
  'two calls sharing one line are not fused into one by dropping string content',
  "pass('a'); fail('b');",
  2,
);

// ── A template literal's ${...} interpolations are executable code, not
//    text: `${pass('inline')}` really does call pass(). Treating the whole
//    template as inert (the earlier version of this scanner did, since
//    backtick strings shared the same drop-everything state as '/") as
//    quotes) undercounted any suite that asserts from inside one
//    (CodeRabbit, #3976 review). ──
expectCount(
  'a pass() call inside a template-literal interpolation is counted',
  "pass(`${pass('inline')} suffix`);",
  2,
);
expectCount(
  'plain template text containing the literal "pass(" (no interpolation) is still not counted',
  'const s = `see pass(fake) here`;',
  0,
);
expectCount(
  'a template nested inside an interpolation is scanned as code at both levels',
  "fail(`outer ${ `inner ${pass('deep')}` }`);",
  2,
);
expectCount(
  "an interpolation's own brace depth is tracked, so an inner { } does not close it early",
  "pass(`${ (function(){ if(true){pass('x');} return 1; })() }`);",
  2,
);
expectCount(
  'a // comment inside an interpolation is still stripped as a comment, not template text',
  "pass(`${ // pass('fake in comment')\n 1 }`);",
  1,
);
expectCount(
  "a string inside an interpolation containing literal 'pass(' text is stripped as a string, not counted",
  "pass(`${ 'pass(not real)' }`);",
  1,
);
