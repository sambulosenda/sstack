import assert from 'node:assert/strict';
import { test } from 'node:test';

import { summarise, toMarkdown } from './metrics.mjs';

const pr = (overrides) => ({
  branch: 'agent/issue-1',
  state: 'closed',
  createdAt: '2026-11-01T10:00:00Z',
  mergedAt: null,
  labels: [],
  commitMessages: ['Add reset button'],
  ...overrides,
});

test('ignores pull requests that the agent did not open', () => {
  const summary = summarise([pr({ branch: 'feature/by-hand', mergedAt: '2026-11-01T12:00:00Z' })]);
  assert.equal(summary.opened, 0);
  assert.equal(summary.mergeRate, null);
  assert.equal(summary.firstPassRate, null);
});

test('counts first-pass merges, retried merges, abandoned and open separately', () => {
  const summary = summarise([
    pr({ mergedAt: '2026-11-01T12:00:00Z' }),
    pr({
      branch: 'agent/issue-2',
      mergedAt: '2026-11-01T16:00:00Z',
      commitMessages: ['Add thing', 'Agent fix attempt 1: Fix testID', 'Agent fix attempt 2: Fix test'],
    }),
    pr({ branch: 'agent/issue-3', labels: ['needs-human'] }),
    pr({ branch: 'agent/issue-4', state: 'open' }),
  ]);

  assert.equal(summary.opened, 4);
  assert.equal(summary.merged, 2);
  assert.equal(summary.abandoned, 1);
  assert.equal(summary.open, 1);
  assert.equal(summary.mergeRate, 2 / 3);
  assert.equal(summary.firstPassRate, 1 / 3);
  assert.equal(summary.needsPersonRate, 1 / 4);
  assert.equal(summary.fixAttemptsPerMergedPr, 1);
  assert.equal(summary.medianHoursToMerge, 4);
});

test('an open pull request does not count against the merge rate', () => {
  const summary = summarise([pr({ state: 'open' })]);
  assert.equal(summary.mergeRate, null);
});

test('renders a table without NaN when there is no data', () => {
  const markdown = toMarkdown(summarise([]), 30);
  assert.match(markdown, /Factory metrics, last 30 days/);
  assert.doesNotMatch(markdown, /NaN|null|undefined/);
});
