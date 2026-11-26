#!/usr/bin/env node
// What a local factory run started from: the branch it compares with, and the untracked files
// that were already in the checkout and belong to the person, not the change.
//
// The scripts used to assume the run started on main with a clean tree. In a real project it
// starts on whatever branch holds the work, and the person keeps scratch files that git does not
// track. Treating those as part of the change put them in the review and counted them in the
// guardrails. A trial on a second app did both.
//
// Usage:
//   node scripts/factory/local-run.mjs start      at preflight, before switching branch: records both
//   node scripts/factory/local-run.mjs base       prints the branch to compare with (main if none recorded)
//   node scripts/factory/local-run.mjs new-files  prints the untracked files the change added, one per line
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = 'agent-output';
const BASE_FILE = 'base.txt';
const BEFORE_FILE = 'untracked-before.txt';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const lines = (text) => text.split('\n').filter(Boolean);
const untracked = (cwd) => lines(git(cwd, 'ls-files', '--others', '--exclude-standard'));

/** Records the current branch (or commit, when detached) and the untracked files there now. */
export function start(cwd = process.cwd()) {
  const branch = git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD').trim();
  const base = branch === 'HEAD' ? git(cwd, 'rev-parse', 'HEAD').trim() : branch;
  mkdirSync(join(cwd, OUT), { recursive: true });
  writeFileSync(join(cwd, OUT, BASE_FILE), `${base}\n`);
  // agent-output/ is ignored by git, so these files never list themselves.
  const before = untracked(cwd);
  writeFileSync(join(cwd, OUT, BEFORE_FILE), before.map((name) => `${name}\n`).join(''));
  return { base, before };
}

/** The branch or commit the run compares with: the one recorded at start, else main. */
export function runBase(cwd = process.cwd()) {
  const file = join(cwd, OUT, BASE_FILE);
  const recorded = existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
  return recorded || 'main';
}

/** Untracked files that were not there when the run started: the change's new files. */
export function newFiles(cwd = process.cwd()) {
  const file = join(cwd, OUT, BEFORE_FILE);
  const before = new Set(existsSync(file) ? lines(readFileSync(file, 'utf8')) : []);
  return untracked(cwd).filter((name) => !before.has(name));
}

function main() {
  const command = process.argv[2];
  if (command === 'start') {
    const { base, before } = start();
    console.log(`Run base: ${base}. Left alone: ${before.length} untracked file(s) already here.`);
  } else if (command === 'base') {
    console.log(runBase());
  } else if (command === 'new-files') {
    for (const name of newFiles()) console.log(name);
  } else {
    console.error('Usage: node scripts/factory/local-run.mjs start | base | new-files');
    process.exit(2);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
