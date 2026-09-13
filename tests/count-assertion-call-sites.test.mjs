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
