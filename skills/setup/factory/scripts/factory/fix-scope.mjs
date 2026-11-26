#!/usr/bin/env node
// Says how much checking a fix needs after QA and review have already run on a change.
//
// A fix made after review is new code that no one but its author has seen. Checking it again
// in full every time is slow; not checking it at all is how a fix slips in unreviewed. The
// rule, after pstack's autopilot: a wording-only change needs no new check, a minor fix needs
// one fresh reviewer, and new behaviour or a large diff needs QA and review again.
//
// The levels this script prints are a floor. An agent may choose a higher level, never a lower.
//
// Usage: node scripts/factory/fix-scope.mjs <commit before the fix> [<commit after the fix>]
//   Without the second commit it reads the working tree, staged, unstaged and new files.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Above this many changed lines of app code (not tests, not comments), a fix counts as large. */
export const LargeFixLines = 80;

export const Levels = {
  none: 'none: wording or comments only. No new check.',
  single: 'single: one fresh reviewer on this fix, plus the scripted checks and Maestro.',
  full: 'full: QA and review again, as for a new change.',
};

const isDoc = (name) => name.endsWith('.md') || name.startsWith('docs/');
const isTest = (name) => /\.test\.[cm]?[jt]sx?$/.test(name);
const isAppSource = (name) => name.startsWith('src/') && /\.[cm]?[jt]sx?$/.test(name) && !isTest(name);
const isComment = (line) => /^(\/\/|\/\*|\*|\{\/\*)/.test(line.trim());
const isConfig = (name) => /^(package\.json|app\.json|app\.config\.[cm]?[jt]s|eas\.json)$/.test(name);

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

const meaningful = (lines) => lines.filter((line) => line.trim() !== '' && !isComment(line));

/**
 * @param {Array<{ filename: string, status: string, patch?: string }>} files The files of the fix.
 * @returns {{ level: 'none' | 'single' | 'full', reasons: string[] }}
 */
export function classifyFix(files) {
  const full = [];
  let appLines = 0;
  let anyChange = false;

  for (const { filename: name, status, patch } of files) {
    const { added, removed } = changedLines(patch);
    const real = [...meaningful(added), ...meaningful(removed)];
    if (isDoc(name) || real.length === 0) continue;
    anyChange = true;

    if (isConfig(name)) full.push(`${name} changed`);
    if (name.startsWith('.maestro/')) full.push(`end-to-end flow ${name} changed`);
    if (isAppSource(name) && status === 'added') full.push(`new app file ${name}`);
    if (name === 'src/lib/strings.ts' && meaningful(added).length > meaningful(removed).length) {
      full.push('new user-facing copy in src/lib/strings.ts');
    }
    if (isAppSource(name)) {
      appLines += real.length;
      const before = removed.join('\n');
      for (const match of added.join('\n').matchAll(/testID\s*(?:=|:)\s*\{?\s*(["'`])([^"'`$\n]+)\1/g)) {
        if (!before.includes(match[2])) full.push(`new testID ${match[2]} in ${name}`);
      }
    }
  }

  if (appLines > LargeFixLines) full.push(`${appLines} changed lines of app code, more than ${LargeFixLines}`);
  if (full.length > 0) return { level: 'full', reasons: full };
  if (!anyChange) return { level: 'none', reasons: ['only documentation, comments or blank lines changed'] };
  return { level: 'single', reasons: [`${appLines} changed lines of app code, no new behaviour found`] };
}

/** The files changed between two commits, or between a commit and the working tree. */
export function filesBetween(base, head, cwd = process.cwd()) {
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const range = head ? [base, head] : [base];
  const statuses = { A: 'added', D: 'removed' };
  const files = git('diff', '--name-status', '--no-renames', ...range)
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [code, filename] = line.split('\t');
      return { filename, status: statuses[code] ?? 'modified', patch: git('diff', '--no-renames', ...range, '--', filename) };
    });
  if (!head) {
    for (const filename of git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean)) {
      const patch = readFileSync(join(cwd, filename), 'utf8').split('\n').map((line) => `+${line}`).join('\n');
      files.push({ filename, status: 'added', patch });
    }
  }
  return files;
}

function main() {
  const [base, head] = process.argv.slice(2);
  if (!base) {
    console.error('Usage: node scripts/factory/fix-scope.mjs <commit before the fix> [<commit after the fix>]');
    process.exit(2);
  }
  const { level, reasons } = classifyFix(filesBetween(base, head));
  console.log(`Re-check: ${Levels[level]}`);
  for (const reason of reasons) console.log(`  ${reason}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
