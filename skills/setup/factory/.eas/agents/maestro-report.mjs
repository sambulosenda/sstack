#!/usr/bin/env node
// Posts the failed Maestro flows on the pull request, so a person can see them without
// opening the run, and so the retry loop can hand them to the coding agent.
//
// Runs in the after_maestro_tests hook of the e2e job in .eas/workflows/pr.yml.
// It never fails the job: a missing report or a missing token only means no comment.
//
// Usage: node .eas/agents/maestro-report.mjs [reportDir]
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const decode = (text) =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/** Reads the test cases out of a JUnit XML report. */
export function parseJunit(xml) {
  const cases = [];
  for (const match of xml.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const name = /\bname="([^"]*)"/.exec(match[1])?.[1] ?? 'unnamed flow';
    const body = match[3] ?? '';
    const failure = /<(failure|error)\b[^>]*?(?:\/>|>([\s\S]*?)<\/\1>)/.exec(body);
    const attribute = /<(?:failure|error)\b[^>]*\bmessage="([^"]*)"/.exec(body)?.[1];
    cases.push({
      name: decode(name),
      failed: Boolean(failure),
      message: failure ? decode((failure[2] || attribute || 'No message.').trim()) : null,
    });
  }
  return cases;
}

export function toMarkdown(cases, shortSha) {
  const failed = cases.filter((testCase) => testCase.failed);
  if (failed.length === 0) return null;
  return [
    `## Maestro results (${shortSha})`,
    '',
    `${failed.length} of ${cases.length} flow(s) failed.`,
    '',
    ...failed.map(
      (testCase) => `- **${testCase.name}**: ${testCase.message.replace(/\s+/g, ' ').slice(0, 500)}`
    ),
    '',
  ].join('\n');
}

function findReports(dir, depth = 0) {
  if (!dir || !existsSync(dir) || depth > 4) return [];
  const found = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const path = join(dir, name);
    const stats = statSync(path, { throwIfNoEntry: false });
    if (!stats) continue;
    if (stats.isDirectory()) found.push(...findReports(path, depth + 1));
    else if (name.endsWith('.xml')) found.push(path);
  }
  return found;
}

function main() {
  const candidates = [process.argv[2], process.env.MAESTRO_TESTS_DIR, join(homedir(), '.maestro', 'tests')];
  const cases = [];
  for (const dir of new Set(candidates.filter(Boolean))) {
    for (const file of findReports(dir)) {
      const xml = readFileSync(file, 'utf8');
      if (xml.includes('<testcase')) cases.push(...parseJunit(xml));
    }
  }

  const markdown = toMarkdown(cases, (process.env.HEAD_SHA ?? '').slice(0, 7));
  if (!markdown) {
    console.log(cases.length ? 'No failed flows.' : 'No JUnit report found. Nothing to post.');
    return;
  }
  console.log(markdown);

  const { PR_NUMBER, GITHUB_TOKEN, GITHUB_REPOSITORY } = process.env;
  if (!PR_NUMBER || !GITHUB_TOKEN || !GITHUB_REPOSITORY) {
    console.log('PR_NUMBER, GITHUB_TOKEN or GITHUB_REPOSITORY is not set. The report was not posted.');
    return;
  }
  const file = join(tmpdir(), 'maestro-comment.md');
  writeFileSync(file, markdown);
  const helper = join(fileURLToPath(new URL('.', import.meta.url)), 'github.mjs');
  execFileSync('node', [helper, 'comment', PR_NUMBER, file], { stdio: 'inherit' });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.log(`Could not post the Maestro report: ${error.message}`);
  }
}
