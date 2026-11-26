#!/usr/bin/env node
// Factory metrics: how well is the issue -> PR line actually working?
//
// Reads the pull requests the agent opened (branches named agent/issue-<n>) and reports
// how many merged, how many merged without a retry, and how many needed a person.
// Watch first-pass rate and needs-a-person rate week on week. If they are not improving,
// the fix is usually in AGENTS.md, app-facts.md, a skill, or how issues are written.
//
// Usage:
//   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo node scripts/factory/metrics.mjs [days]
//   (with the GitHub CLI: GITHUB_TOKEN=$(gh auth token) GITHUB_REPOSITORY=owner/repo node ...)
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const AGENT_BRANCH_PREFIX = 'agent/issue-';
export const FIX_COMMIT_PREFIX = 'Agent fix attempt';
export const NEEDS_HUMAN_LABEL = 'needs-human';

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function rate(part, whole) {
  return whole === 0 ? null : part / whole;
}

/**
 * @param {Array<{ branch: string, state: 'open'|'closed', createdAt: string, mergedAt: string|null,
 *   labels: string[], commitMessages: string[] }>} pullRequests
 */
export function summarise(pullRequests) {
  const agentPrs = pullRequests.filter((pr) => pr.branch.startsWith(AGENT_BRANCH_PREFIX));
  const withAttempts = agentPrs.map((pr) => ({
    ...pr,
    fixAttempts: pr.commitMessages.filter((message) => message.startsWith(FIX_COMMIT_PREFIX)).length,
  }));

  const merged = withAttempts.filter((pr) => pr.mergedAt);
  const abandoned = withAttempts.filter((pr) => pr.state === 'closed' && !pr.mergedAt);
  const open = withAttempts.filter((pr) => pr.state === 'open');
  const finished = merged.length + abandoned.length;
  const firstPass = merged.filter((pr) => pr.fixAttempts === 0);
  const neededPerson = withAttempts.filter((pr) => pr.labels.includes(NEEDS_HUMAN_LABEL));
  const hoursToMerge = merged.map(
    (pr) => (new Date(pr.mergedAt).getTime() - new Date(pr.createdAt).getTime()) / 3_600_000
  );

  return {
    opened: withAttempts.length,
    merged: merged.length,
    abandoned: abandoned.length,
    open: open.length,
    mergeRate: rate(merged.length, finished),
    firstPassRate: rate(firstPass.length, finished),
    needsPersonRate: rate(neededPerson.length, withAttempts.length),
    fixAttemptsPerMergedPr: merged.length
      ? merged.reduce((sum, pr) => sum + pr.fixAttempts, 0) / merged.length
      : null,
    medianHoursToMerge: median(hoursToMerge),
  };
}

const percent = (value) => (value === null ? 'n/a' : `${Math.round(value * 100)}%`);
const number = (value, digits = 1) => (value === null ? 'n/a' : value.toFixed(digits));

export function toMarkdown(summary, days) {
  return [
    `## Factory metrics, last ${days} days`,
    '',
    '| Measure | Value | What it tells you |',
    '| --- | --- | --- |',
    `| Agent PRs opened | ${summary.opened} | Throughput |`,
    `| Merged | ${summary.merged} | |`,
    `| Closed without merging | ${summary.abandoned} | Wasted runs |`,
    `| Still open | ${summary.open} | Review queue |`,
    `| Merge rate | ${percent(summary.mergeRate)} | Of finished PRs, how many were worth merging |`,
    `| First-pass rate | ${percent(summary.firstPassRate)} | Merged with no fix attempt. The headline number |`,
    `| Needed a person | ${percent(summary.needsPersonRate)} | Hit the retry cap or could not be fixed |`,
    `| Fix attempts per merged PR | ${number(summary.fixAttemptsPerMergedPr)} | How hard the retry loop is working |`,
    `| Median hours, opened to merged | ${number(summary.medianHoursToMerge)} | Mostly your review time |`,
    '',
  ].join('\n');
}

async function github(path, token) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} for ${path}: ${await response.text()}`);
  }
  return response.json();
}

async function fetchPullRequests(repository, token, since) {
  const pullRequests = [];
  for (let page = 1; page <= 10; page += 1) {
    const batch = await github(
      `/repos/${repository}/pulls?state=all&sort=created&direction=desc&per_page=100&page=${page}`,
      token
    );
    const recent = batch.filter((pr) => new Date(pr.created_at) >= since);
    for (const pr of recent) {
      if (!pr.head.ref.startsWith(AGENT_BRANCH_PREFIX)) continue;
      const commits = await github(
        `/repos/${repository}/pulls/${pr.number}/commits?per_page=100`,
        token
      );
      pullRequests.push({
        branch: pr.head.ref,
        state: pr.state,
        createdAt: pr.created_at,
        mergedAt: pr.merged_at,
        labels: pr.labels.map((label) => label.name),
        commitMessages: commits.map((commit) => commit.commit.message),
      });
    }
    if (batch.length < 100 || recent.length < batch.length) break;
  }
  return pullRequests;
}

async function main() {
  const days = Number(process.argv[2] ?? 30);
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repository || !token) {
    console.error('Set GITHUB_REPOSITORY (owner/repo) and GITHUB_TOKEN.');
    process.exit(1);
  }

  const since = new Date(Date.now() - days * 24 * 3_600_000);
  const markdown = toMarkdown(summarise(await fetchPullRequests(repository, token, since)), days);
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
