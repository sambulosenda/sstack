#!/usr/bin/env node
// What a local factory run started from: the commit it compares with, and the untracked files
// that were already in the checkout and belong to the person, not the change.
//
// The scripts used to assume the run started on main with a clean tree. In a real project it
// starts on whatever branch holds the work, and the person keeps scratch files that git does not
// track. Treating those as part of the change put them in the review and counted them in the
// guardrails. A trial on a second app did both.
//
// This is a local convenience, not a security boundary: the agent that makes the change can
// write agent-output/ like any file. The cloud pipeline's guardrails take the changed files from
// the pull request instead. Two checks still keep a local run honest:
// - The base is recorded as a commit, and must still be an ancestor of HEAD when it is used.
// - Each untracked file is recorded with its content hash. One that changes during the run is
//   part of the change: it goes into the guardrails, fix-scope and the review diff.
//
// Usage:
//   node scripts/factory/local-run.mjs start      before the change's branch is made: records both
//   node scripts/factory/local-run.mjs base       prints the commit to compare with (main if none recorded)
//   node scripts/factory/local-run.mjs base-name  prints the branch the run started on, for people
//   node scripts/factory/local-run.mjs new-files  prints the untracked files that are the change's, one per line
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
const hashOf = (cwd, name) => git(cwd, 'hash-object', '--', name).trim();

/** Records the current branch and commit, and each untracked file there now with its hash. */
export function start(cwd = process.cwd()) {
  const branch = git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD').trim();
  const commit = git(cwd, 'rev-parse', 'HEAD').trim();
  const name = branch === 'HEAD' ? commit : branch;
  mkdirSync(join(cwd, OUT), { recursive: true });
  writeFileSync(join(cwd, OUT, BASE_FILE), `${commit} ${name}\n`);
  // agent-output/ is ignored by git, so these files never list themselves.
  const before = untracked(cwd);
  writeFileSync(join(cwd, OUT, BEFORE_FILE), before.map((file) => `${hashOf(cwd, file)} ${file}\n`).join(''));
  return { base: commit, name, before };
}

function recorded(cwd) {
  const file = join(cwd, OUT, BASE_FILE);
  const [commit = '', name = ''] = existsSync(file) ? readFileSync(file, 'utf8').trim().split(' ') : [];
  return { commit, name: name || commit };
}

/**
 * The commit the run compares with: the one recorded at start, else main. A recorded commit that
 * is no longer an ancestor of HEAD is refused: comparing with it would hide part of the change.
 */
export function runBase(cwd = process.cwd()) {
  const { commit } = recorded(cwd);
  if (!commit) return 'main';
  try {
    git(cwd, 'merge-base', '--is-ancestor', commit, 'HEAD');
  } catch {
    throw new Error(`The recorded base ${commit} is not an ancestor of HEAD. Check out the change's branch, or record the base again with: node scripts/factory/local-run.mjs start`);
  }
  return commit;
}

/** The branch the run started on, as a person would name it. */
export function runBaseName(cwd = process.cwd()) {
  return recorded(cwd).name || 'main';
}

/**
 * Untracked files that are the change's: those that were not there when the run started, and
 * those that were but whose content has changed since.
 */
export function newFiles(cwd = process.cwd()) {
  const file = join(cwd, OUT, BEFORE_FILE);
  const before = new Map();
  if (existsSync(file)) {
    for (const line of lines(readFileSync(file, 'utf8'))) {
      const space = line.indexOf(' ');
      before.set(line.slice(space + 1), line.slice(0, space));
    }
  }
  return untracked(cwd).filter((name) => before.get(name) !== hashOf(cwd, name));
}

function main() {
  const command = process.argv[2];
  if (command === 'start') {
    const { name, before } = start();
    console.log(`Run base: ${name}. Left alone unless they change: ${before.length} untracked file(s) already here.`);
  } else if (command === 'base') {
    console.log(runBase());
  } else if (command === 'base-name') {
    console.log(runBaseName());
  } else if (command === 'new-files') {
    for (const name of newFiles()) console.log(name);
  } else {
    console.error('Usage: node scripts/factory/local-run.mjs start | base | base-name | new-files');
    process.exit(2);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
