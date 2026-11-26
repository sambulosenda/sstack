import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classifyFix, LargeFixLines } from './fix-scope.mjs';

const file = (filename, patch, status = 'modified') => ({ filename, status, patch });
const lines = (count, prefix = '+') => Array.from({ length: count }, (_, i) => `${prefix}const x${i} = ${i};`).join('\n');

test('a fix to docs or comments needs no new check', () => {
  const { level } = classifyFix([
    file('README.md', '+A new sentence.'),
    file('src/features/home/home-screen.tsx', '-  // old note\n+  // clearer note\n+'),
  ]);
  assert.equal(level, 'none');
});

test('a small fix to app code and its tests needs one fresh reviewer', () => {
  const { level } = classifyFix([
    file('src/features/home/home-screen.tsx', '-  {session.state ? null : (\n+  {session.state || !loaded ? null : ('),
    file('src/features/home/home-screen.test.tsx', lines(30)),
  ]);
  assert.equal(level, 'single');
});

test('tests do not count towards a large fix', () => {
  assert.equal(classifyFix([file('src/a.test.ts', lines(500))]).level, 'single');
});

test('a large change to app code needs QA and review again', () => {
  const { level, reasons } = classifyFix([file('src/features/a.ts', lines(LargeFixLines + 1))]);
  assert.equal(level, 'full');
  assert.match(reasons[0], /changed lines of app code, more than/);
});

test('new behaviour needs QA and review again', () => {
  const cases = [
    [file('src/features/breathing/new-thing.tsx', lines(3), 'added'), /new app file/],
    [file('src/lib/strings.ts', "+    done: 'Done',"), /new user-facing copy/],
    [file('src/features/home/home-screen.tsx', '+<AppButton testID="home-share" />'), /new testID home-share/],
    [file('.maestro/share.yaml', '+- tapOn: x', 'added'), /end-to-end flow/],
    [file('package.json', '+    "clearMocks": true,'), /package\.json changed/],
  ];
  for (const [changed, reason] of cases) {
    const { level, reasons } = classifyFix([changed]);
    assert.equal(level, 'full', changed.filename);
    assert.match(reasons.join('\n'), reason);
  }
});

test('a testID that only moves is not new', () => {
  const patch = "-  box: 'home-pattern-box',\n+  box: { testID: 'home-pattern-box' },";
  assert.equal(classifyFix([file('src/features/breathing/pattern-picker.tsx', patch)]).level, 'single');
});

test('rewording existing copy is a minor fix, not new behaviour', () => {
  const patch = "-    start: 'Begin',\n+    start: 'Start',";
  assert.equal(classifyFix([file('src/lib/strings.ts', patch)]).level, 'single');
});
