import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { findViolations, localFiles } from './check-guardrails.mjs';

const file = (filename, patch, status = 'modified') => ({ filename, status, patch });

test('passes a normal change that adds code and a test', () => {
  const files = [
    file('src/features/home/counter.ts', "+    case 'double':\n+      return count * 2;"),
    file('src/features/home/counter.test.ts', "+  it('doubles', () => {\n+    expect(counterReducer(2, { type: 'double' })).toBe(4);\n+  });"),
  ];
  assert.deepEqual(findViolations(files), []);
});

test('fails when a test file or a flow is deleted', () => {
  const violations = findViolations([
    file('src/lib/storage.test.ts', "-it('x', () => {});", 'removed'),
    file('.maestro/paywall.yaml', '- assertVisible: x', 'removed'),
  ]);
  assert.equal(violations.length, 2);
  assert.match(violations[0], /storage\.test\.ts: the file was deleted/);
});

test('fails when the lint rules change, such as a file added to the exception list', () => {
  const violations = findViolations([
    file('eslint.config.js', "+  'src/features/home/home-screen.tsx',"),
  ]);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /eslint\.config\.js: changes the lint rules/);
});

test('fails when the lint config is renamed or another config file is added', () => {
  const violations = findViolations([
    { filename: 'eslint.config.mjs', previous_filename: 'eslint.config.js', status: 'renamed', patch: '' },
    file('.eslintrc.json', '+{}', 'added'),
  ]);
  assert.equal(violations.length, 2);
  for (const violation of violations) assert.match(violation, /changes the lint rules/);
});

test('fails on an inline comment that turns a lint rule off', () => {
  const violations = findViolations([
    file('src/f.tsx', '+/* eslint no-restricted-syntax: "off" */'),
    file('src/g.tsx', '+/*eslint-enable*/'),
  ]);
  assert.equal(violations.length, 2);
  for (const violation of violations) assert.match(violation, /silences the linter/);
});

test('allows deleting an ordinary source file', () => {
  assert.deepEqual(findViolations([file('src/features/old/thing.ts', '-export {};', 'removed')]), []);
});

test('fails when more tests or expectations are removed than added', () => {
  const violations = findViolations([
    file('src/a.test.ts', "-  it('resets', () => {\n-    expect(reset()).toBe(0);\n-  });"),
  ]);
  assert.equal(violations.length, 2);
  assert.match(violations[0], /1 more test\(s\) removed/);
  assert.match(violations[1], /1 more expect\(\) call\(s\) removed/);
});

test('allows rewriting a test when the count does not drop', () => {
  const patch = "-  it('shows 3 steps', () => {\n-    expect(steps).toHaveLength(3);\n+  it('shows 4 steps', () => {\n+    expect(steps).toHaveLength(4);";
  assert.deepEqual(findViolations([file('src/a.test.ts', patch)]), []);
});

test('fails when a Maestro flow loses an assertion', () => {
  const violations = findViolations([
    file('.maestro/paywall.yaml', '-- assertVisible:\n-    id: "paywall-restore"'),
  ]);
  assert.match(violations[0], /1 more assertion step\(s\) removed/);
});

test('fails when a Maestro step is made optional', () => {
  const violations = findViolations([file('.maestro/smoke.yaml', '+    optional: true')]);
  assert.match(violations[0], /makes a Maestro step optional/);
});

test('fails on skips, onlys, and type or lint escapes', () => {
  const violations = findViolations([
    file('src/a.test.ts', "+  it.skip('flaky', () => {\n+    expect(1).toBe(1);\n+  });"),
    file('src/b.ts', '+// @ts-ignore\n+const x: any = y;'),
    file('src/c.tsx', '+// eslint-disable-next-line react-hooks/exhaustive-deps'),
    file('src/d.test.ts', "+  xit('later', () => {});"),
  ]);
  assert.equal(violations.length, 5);
  assert.ok(violations.some((v) => /skips or narrows tests/.test(v)));
  assert.ok(violations.some((v) => /silences the type checker/.test(v)));
  assert.ok(violations.some((v) => /uses the any type/.test(v)));
  assert.ok(violations.some((v) => /silences the linter/.test(v)));
});

test('ignores words that only look like escapes', () => {
  const files = [file('src/e.ts', '+const company = getCompany();\n+// works for any input\n+it.each(cases)')];
  assert.deepEqual(findViolations(files), []);
});

test('ignores files with no patch, such as images', () => {
  assert.deepEqual(findViolations([{ filename: 'assets/icon.png', status: 'modified' }]), []);
});

test('local mode reads commits, unstaged changes and new files from git', () => {
  const dir = mkdtempSync(join(tmpdir(), 'guardrails-'));
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir, encoding: 'utf8' });
  try {
    git('init', '-q', '-b', 'main');
    writeFileSync(join(dir, 'a.test.ts'), "it('a', () => {\n  expect(1).toBe(1);\n});\n");
    writeFileSync(join(dir, 'b.test.ts'), "it('b', () => {\n  expect(2).toBe(2);\n});\n");
    writeFileSync(join(dir, 'c.ts'), 'export const c = 1;\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'base');
    git('switch', '-q', '-c', 'agent/issue-1');

    git('rm', '-q', 'a.test.ts');
    git('commit', '-q', '-m', 'delete a test');
    writeFileSync(join(dir, 'b.test.ts'), "it('b', () => {});\n");
    writeFileSync(join(dir, 'd.ts'), 'export const d = 1 as any;\n');

    const files = localFiles('main', dir);
    assert.deepEqual(
      files.map((file) => `${file.status} ${file.filename}`).sort(),
      ['added d.ts', 'modified b.test.ts', 'removed a.test.ts']
    );
    const violations = findViolations(files);
    assert.equal(violations.length, 3);
    assert.ok(violations.some((line) => /a\.test\.ts: the file was deleted/.test(line)));
    assert.ok(violations.some((line) => /b\.test\.ts: 1 more expect\(\) call\(s\) removed/.test(line)));
    assert.ok(violations.some((line) => /d\.ts: uses the any type/.test(line)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
