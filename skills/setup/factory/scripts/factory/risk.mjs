#!/usr/bin/env node
// Labels a pull request risk:low, risk:medium or risk:high from the paths it changes.
//
// The coding agent also writes Impact and Rollback cost verdicts in the pull request
// description, but it writes them about its own work. This label is computed from the diff,
// so it cannot be talked down, and it shows in the pull request list without opening anything.
// The scale matches "When you finish" in AGENTS.md. Keep the two in step.
//
// The label is advice for the reviewer. This script never fails the checks.
//
// Usage (in CI): PR_NUMBER=12 GITHUB_TOKEN=... GITHUB_REPOSITORY=o/r node scripts/factory/risk.mjs
// Usage (local): node scripts/factory/risk.mjs src/lib/storage.ts src/features/home/home-screen.tsx
import { fileURLToPath } from 'node:url';

export const LEVELS = ['low', 'medium', 'high'];
export const labelFor = (level) => `risk:${level}`;
export const HUGE = 1000;

const isAppTest = (name) => name.startsWith('src/') && /\.test\.[cm]?[jt]sx?$/.test(name);

// First match wins, so the high rules come first.
const RULES = [
  ['high', /^src\/lib\/purchases(\/|\.)/, 'purchase logic'],
  ['high', /^src\/lib\/analytics(\/|\.)/, 'analytics'],
  ['high', /^src\/lib\/storage\.ts$/, 'persisted data'],
  ['high', /^(app\.json|app\.config\.[cm]?[jt]s|eas\.json)$/, 'native or release configuration'],
  ['high', /^(package\.json|package-lock\.json)$/, 'dependencies'],
  ['high', /^(\.eas|\.github|scripts\/factory)\//, 'the pipeline itself'],
  ['high', /^(AGENTS|CLAUDE)\.md$/, 'the rules that agents follow'],
  ['medium', /^src\/(components|constants|lib)\//, 'shared code that several screens use'],
  ['medium', /^src\/app\//, 'routes and navigation'],
  ['medium', /^(tsconfig\.json|eslint\.config\.[cm]?js|jest\/|types\/)/, 'build and test tooling'],
];

/**
 * @param {string[]} filenames The paths that a pull request changes.
 * @returns {{ level: 'low' | 'medium' | 'high', reasons: string[] }}
 */
export function assessRisk(filenames) {
  const found = new Map(); // reason -> { level, files }
  const note = (level, reason, name) => {
    const entry = found.get(reason) ?? { level, files: [] };
    entry.files.push(name);
    found.set(reason, entry);
  };

  const features = new Set();
  for (const name of filenames) {
    if (isAppTest(name)) continue;
    const feature = name.match(/^src\/features\/([^/]+)\//);
    if (feature) features.add(feature[1]);
    const rule = RULES.find(([, pattern]) => pattern.test(name));
    if (rule) note(rule[0], rule[2], name);
  }
  // Past this size the file list from GitHub may be cut short, and nobody can review it closely.
  if (filenames.length >= HUGE) {
    found.set(`a very large change (${filenames.length} paths)`, { level: 'high', files: ['all of it'] });
  }
  if (features.size > 1) {
    found.set(`${features.size} features at once`, {
      level: 'medium',
      files: [...features].map((feature) => `src/features/${feature}/`),
    });
  }

  const entries = [...found].sort(
    ([, a], [, b]) => LEVELS.indexOf(b.level) - LEVELS.indexOf(a.level)
  );
  const level = entries.length > 0 ? entries[0][1].level : 'low';
  const reasons = entries.map(([reason, { level: reasonLevel, files }]) => {
    const shown = files.slice(0, 3).join(', ') + (files.length > 3 ? `, and ${files.length - 3} more` : '');
    return `${reasonLevel}: ${reason} (${shown})`;
  });
  if (reasons.length === 0) {
    reasons.push(
      features.size === 1
        ? `low: one feature only (src/features/${[...features][0]}/)`
        : 'low: no shared code, configuration or persisted data'
    );
  }
  return { level, reasons };
}

async function github(method, path, body) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'content-type': 'application/json',
      'x-github-api-version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} for ${method} ${path}: ${await response.text()}`);
  }
  return response.json();
}

async function main() {
  const local = process.argv.slice(2);
  if (local.length > 0) {
    const { level, reasons } = assessRisk(local);
    console.log(`Risk: ${level}\n${reasons.map((reason) => `  ${reason}`).join('\n')}`);
    return;
  }

  const { PR_NUMBER, GITHUB_TOKEN, GITHUB_REPOSITORY } = process.env;
  if (!PR_NUMBER || !GITHUB_TOKEN || !GITHUB_REPOSITORY) {
    console.log('Risk: PR_NUMBER, GITHUB_TOKEN or GITHUB_REPOSITORY is not set. No label added.');
    return;
  }

  const repo = `/repos/${GITHUB_REPOSITORY}`;
  const files = [];
  // GitHub lists at most 3000 files of a pull request.
  for (let page = 1; page <= 30; page += 1) {
    const batch = await github('GET', `${repo}/pulls/${PR_NUMBER}/files?per_page=100&page=${page}`);
    // A rename counts for both paths: moving a file out of a sensitive folder is a change to it.
    for (const file of batch) files.push(file.filename, ...(file.previous_filename ? [file.previous_filename] : []));
    if (batch.length < 100) break;
  }

  const { level, reasons } = assessRisk(files);
  console.log(`Risk: ${level}\n${reasons.map((reason) => `  ${reason}`).join('\n')}`);

  // The level can change between commits, so drop the labels of the other levels.
  const current = await github('GET', `${repo}/issues/${PR_NUMBER}/labels?per_page=100`);
  for (const label of current) {
    const stale = LEVELS.some((other) => other !== level && label.name === labelFor(other));
    if (stale) await github('DELETE', `${repo}/issues/${PR_NUMBER}/labels/${encodeURIComponent(label.name)}`);
  }
  if (!current.some((label) => label.name === labelFor(level))) {
    await github('POST', `${repo}/issues/${PR_NUMBER}/labels`, { labels: [labelFor(level)] });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    // Advice only: a GitHub hiccup here must not fail the checks.
    console.error(`Risk: the label could not be set. ${error.message}`);
  }
}
