import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assessRisk, labelFor } from './risk.mjs';

test('one feature folder is low', () => {
  const { level, reasons } = assessRisk([
    'src/features/home/home-screen.tsx',
    'src/features/home/counter.ts',
    'src/features/home/counter.test.ts',
    '.maestro/smoke.yaml',
  ]);
  assert.equal(level, 'low');
  assert.match(reasons[0], /one feature only \(src\/features\/home\/\)/);
});

test('docs and flows alone are low', () => {
  assert.equal(assessRisk(['README.md', '.maestro/paywall.yaml']).level, 'low');
  assert.equal(assessRisk([]).level, 'low');
});

test('shared components, tokens, strings and routes are medium', () => {
  for (const name of [
    'src/components/app-button.tsx',
    'src/constants/theme.ts',
    'src/lib/strings.ts',
    'src/app/settings.tsx',
  ]) {
    assert.equal(assessRisk(['src/features/home/home-screen.tsx', name]).level, 'medium', name);
  }
});

test('two features at once is medium', () => {
  const { level, reasons } = assessRisk([
    'src/features/home/home-screen.tsx',
    'src/features/settings/settings-screen.tsx',
  ]);
  assert.equal(level, 'medium');
  assert.match(reasons[0], /2 features at once/);
});

test('purchases, analytics, storage, configuration and dependencies are high', () => {
  for (const name of [
    'src/lib/purchases/index.ts',
    'src/lib/analytics/events.ts',
    'src/lib/storage.ts',
    'app.json',
    'eas.json',
    'package.json',
    'package-lock.json',
  ]) {
    assert.equal(assessRisk([name]).level, 'high', name);
  }
});

test('the pipeline and the agent rules are high', () => {
  for (const name of [
    '.eas/workflows/pr.yml',
    '.github/workflows/agent-label.yml',
    'scripts/factory/check-guardrails.mjs',
    'scripts/factory/check-guardrails.test.mjs',
    'AGENTS.md',
  ]) {
    assert.equal(assessRisk([name]).level, 'high', name);
  }
});

test('the highest level wins and is listed first', () => {
  const { level, reasons } = assessRisk([
    'src/features/home/home-screen.tsx',
    'src/components/app-button.tsx',
    'src/lib/storage.ts',
  ]);
  assert.equal(level, 'high');
  assert.match(reasons[0], /^high: persisted data \(src\/lib\/storage\.ts\)/);
  assert.match(reasons[1], /^medium: shared code/);
});

test('an app test file does not raise the level', () => {
  assert.equal(assessRisk(['src/lib/purchases/purchases.test.ts']).level, 'low');
  assert.equal(assessRisk(['src/features/home/a.test.ts', 'src/features/paywall/b.test.ts']).level, 'low');
});

test('a long file list is shortened in the reason', () => {
  const names = ['a', 'b', 'c', 'd', 'e'].map((name) => `src/components/${name}.tsx`);
  assert.match(assessRisk(names).reasons[0], /a\.tsx, .*c\.tsx, and 2 more\)/);
});

test('a very large change is high, whatever it touches', () => {
  const names = Array.from({ length: 1000 }, (_, index) => `docs/page-${index}.md`);
  const { level, reasons } = assessRisk(names);
  assert.equal(level, 'high');
  assert.match(reasons[0], /a very large change \(1000 paths\)/);
  assert.equal(assessRisk(names.slice(1)).level, 'low');
});

test('label names', () => {
  assert.equal(labelFor('high'), 'risk:high');
});
