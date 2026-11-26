import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseJunit, toMarkdown } from '../../.eas/agents/maestro-report.mjs';

const report = `<?xml version='1.0' encoding='UTF-8'?>
<testsuites>
  <testsuite name="Test Suite" device="iPhone 16" tests="3" failures="1" time="48.2">
    <testcase id="Smoke - launches to home" name="Smoke - launches to home" classname="Smoke - launches to home" time="11.9" status="SUCCESS"/>
    <testcase id="Paywall - opens and closes" name="Paywall - opens and closes" classname="Paywall - opens and closes" time="21.4" status="ERROR">
      <failure>Assertion is false: id: paywall-restore is visible &amp; enabled</failure>
    </testcase>
    <testcase id="Settings" name="Settings" classname="Settings" time="14.9" status="SUCCESS"></testcase>
  </testsuite>
</testsuites>`;

test('reads passed and failed flows from a JUnit report', () => {
  const cases = parseJunit(report);
  assert.equal(cases.length, 3);
  assert.deepEqual(
    cases.map((testCase) => testCase.failed),
    [false, true, false]
  );
  assert.equal(cases[1].name, 'Paywall - opens and closes');
  assert.equal(cases[1].message, 'Assertion is false: id: paywall-restore is visible & enabled');
});

test('reads a failure written as a message attribute', () => {
  const cases = parseJunit('<testcase name="A"><failure message="Element not found" /></testcase>');
  assert.equal(cases[0].failed, true);
  assert.equal(cases[0].message, 'Element not found');
});

test('writes a comment that names the commit and each failed flow', () => {
  const markdown = toMarkdown(parseJunit(report), 'abc1234');
  assert.match(markdown, /^## Maestro results \(abc1234\)/);
  assert.match(markdown, /1 of 3 flow\(s\) failed/);
  assert.match(markdown, /\*\*Paywall - opens and closes\*\*: Assertion is false/);
  assert.doesNotMatch(markdown, /Smoke/);
});

test('writes nothing when every flow passed', () => {
  assert.equal(toMarkdown(parseJunit('<testcase name="A" status="SUCCESS"/>'), 'abc1234'), null);
  assert.equal(toMarkdown([], 'abc1234'), null);
});
