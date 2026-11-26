#!/usr/bin/env node
// Fails a pull request that makes the checks weaker instead of making the code right.
//
// AGENTS.md tells agents not to delete tests, drop assertions or silence the type checker.
// A rule in a prompt is a request. This script is the enforcement: it reads the diff of the
// pull request from GitHub and fails when the diff
//   - deletes a test file or a Maestro flow,
//   - removes more tests or assertions than it adds,
//   - adds a skip, an "only", a type-check escape or a lint escape,
//   - changes, renames or adds an ESLint config file.
//
// It runs on pull requests that the agent opened (branch agent/issue-<n>). A person can
// override it for one pull request with the label "allow-test-changes".
//
// Usage (in CI): PR_NUMBER=12 BRANCH=agent/issue-7 GITHUB_TOKEN=... GITHUB_REPOSITORY=o/r \
//   node scripts/factory/check-guardrails.mjs
// Usage (local run, no GitHub): node scripts/factory/check-guardrails.mjs --local [<base>]
//   Without a base it compares with the branch the run started from (scripts/factory/local-run.mjs).
//   Checks everything that differs from the base branch: commits, staged and unstaged
//   changes, and new files.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newFiles, runBase } from './local-run.mjs';

export const OVERRIDE_LABEL = 'allow-test-changes';

const isTestFile = (name) => /\.test\.[cm]?[jt]sx?$/.test(name);
const isFlow = (name) => /^\.maestro\/.*\.ya?ml$/.test(name);
const isSource = (name) => /\.[cm]?[jt]sx?$/.test(name) && !name.startsWith('scripts/factory/');
const isLintConfig = (name = '') =>
  /(^|\/)(\.eslintrc(\.\w+)?|\.eslintignore|eslint\.config\.[cm]?[jt]s)$/.test(name);

const TEST_CASE = /\b(?:it|test)\s*\(/;
const EXPECTATION = /\bexpect\s*\(/;
const FLOW_ASSERTION = /^\s*-\s*(?:assert\w*|extendedWaitUntil)\b/;
const ESCAPES = [
  [/@ts-ignore|@ts-expect-error|@ts-nocheck/, 'silences the type checker'],
  // eslint-disable anywhere, a /* eslint ... */ block that configures rules, or a // eslint-... line.
  [/eslint-disable|\/\*\s*eslint(?:[\s-]|\*\/)|\/\/\s*eslint-/, 'silences the linter'],
  [/\b(?:it|test|describe)\.(?:skip|only|todo)\s*\(|\bx(?:it|test|describe)\s*\(/, 'skips or narrows tests'],
  [/:\s*any\b|\bas\s+any\b|<any>/, 'uses the any type'],
  [/optional:\s*true/, 'makes a Maestro step optional', isFlow],
];

function changedLines(patch = '') {
  const added = [];
  const removed = [];
  for (const line of patch.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) added.push(line.slice(1));
    else if (line.startsWith('-')) removed.push(line.slice(1));
  }
  return { added, removed };
}

const count = (lines, pattern) => lines.filter((line) => pattern.test(line)).length;

/**
 * @param {Array<{ filename: string, status: string, patch?: string }>} files
 *   The files of a pull request, as the GitHub API returns them.
 * @returns {string[]} One line per violation. Empty when the diff is fine.
 */
export function findViolations(files) {
  const violations = [];

  for (const file of files) {
    const name = file.filename;
    const { added, removed } = changedLines(file.patch);

    // The lint rules enforce AGENTS.md. Turning one off, or adding a file to its exception
    // list, is the same as an eslint-disable comment. GitHub lists a renamed file under its new
    // name, so check the old name too.
    if (isLintConfig(name) || isLintConfig(file.previous_filename)) {
      violations.push(`${name}: changes the lint rules. Fix the code the linter flags instead.`);
      continue;
    }

    if (file.status === 'removed' && (isTestFile(name) || isFlow(name))) {
      violations.push(`${name}: the file was deleted.`);
      continue;
    }

    if (isTestFile(name)) {
      const tests = count(added, TEST_CASE) - count(removed, TEST_CASE);
      const expectations = count(added, EXPECTATION) - count(removed, EXPECTATION);
      if (tests < 0) violations.push(`${name}: ${-tests} more test(s) removed than added.`);
      if (expectations < 0) {
        violations.push(`${name}: ${-expectations} more expect() call(s) removed than added.`);
      }
    }

    if (isFlow(name)) {
      const assertions = count(added, FLOW_ASSERTION) - count(removed, FLOW_ASSERTION);
      if (assertions < 0) {
        violations.push(`${name}: ${-assertions} more assertion step(s) removed than added.`);
      }
    }

    for (const [pattern, what, appliesTo = isSource] of ESCAPES) {
      if (!appliesTo(name)) continue;
      const hits = added.filter((line) => pattern.test(line));
      if (hits.length > 0) violations.push(`${name}: ${what} ("${hits[0].trim().slice(0, 80)}").`);
    }
  }

  return violations;
}

/**
 * The same shape as the GitHub API gives, built from git in a local checkout.
 * @param {string} base The branch or commit to compare with.
 * @param {string} [cwd] The checkout. Defaults to the current folder.
 */
export function localFiles(base, cwd = process.cwd()) {
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const lines = (text) => text.split('\n').filter(Boolean);
  const statuses = { A: 'added', D: 'removed' };

  const files = lines(git('diff', '--name-status', '--no-renames', base)).map((line) => {
    const [code, filename] = line.split('\t');
    return {
      filename,
      status: statuses[code] ?? 'modified',
      patch: git('diff', '--no-renames', base, '--', filename),
    };
  });
  // git diff does not list files that were never added. Untracked files that were there before
  // the run started are the person's, not the change's (scripts/factory/local-run.mjs).
  for (const filename of newFiles(cwd)) {
    const added = readFileSync(join(cwd, filename), 'utf8').split('\n').map((line) => `+${line}`);
    files.push({ filename, status: 'added', patch: added.join('\n') });
  }
  return files;
}

function report(violations, fileCount, overrideHint) {
  if (violations.length === 0) {
    console.log(`Guardrails OK: ${fileCount} changed file(s), no weakened checks.`);
    return;
  }
  console.error('This change weakens the checks:\n');
  for (const violation of violations) console.error(`  ${violation}`);
  console.error(`\nFix the code instead. ${overrideHint}`);
  process.exit(1);
}

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} for ${path}: ${await response.text()}`);
  }
  return response.json();
}

async function main() {
  const localFlag = process.argv.indexOf('--local');
  if (localFlag !== -1) {
    const files = localFiles(process.argv[localFlag + 1] ?? runBase());
    report(findViolations(files), files.length, 'If the issue really does remove this behaviour, ask the person who started the run.');
    return;
  }

  const { PR_NUMBER, BRANCH = '', GITHUB_TOKEN, GITHUB_REPOSITORY } = process.env;

  if (!BRANCH.startsWith('agent/issue-')) {
    console.log('Guardrails: not an agent pull request. Skipped.');
    return;
  }
  if (!PR_NUMBER || !GITHUB_TOKEN || !GITHUB_REPOSITORY) {
    // An agent PR that cannot be inspected must not pass by default.
    console.error('Guardrails: PR_NUMBER, GITHUB_TOKEN or GITHUB_REPOSITORY is not set, so the diff cannot be read.');
    process.exit(1);
  }

  const repo = `/repos/${GITHUB_REPOSITORY}`;
  const pullRequest = await github(`${repo}/pulls/${PR_NUMBER}`);
  if (pullRequest.labels.some((label) => label.name === OVERRIDE_LABEL)) {
    console.log(`Guardrails: the "${OVERRIDE_LABEL}" label is set. A person allowed this. Skipped.`);
    return;
  }

  const files = [];
  for (let page = 1; page <= 10; page += 1) {
    const batch = await github(`${repo}/pulls/${PR_NUMBER}/files?per_page=100&page=${page}`);
    files.push(...batch);
    if (batch.length < 100) break;
  }

  report(
    findViolations(files),
    files.length,
    `If the issue really does remove this behaviour, a person can add the "${OVERRIDE_LABEL}" label.`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
