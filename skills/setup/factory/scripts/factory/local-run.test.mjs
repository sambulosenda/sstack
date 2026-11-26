import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { newFiles, runBase, runBaseName, start } from './local-run.mjs';

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'local-run-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'trial');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  writeFileSync(join(dir, '.gitignore'), 'agent-output/\n');
  writeFileSync(join(dir, 'app.ts'), 'export const a = 1;\n');
  git('add', '.');
  git('commit', '-q', '-m', 'first');
  return { dir, git };
}

test('without a recorded start, the base is main and every untracked file is new', () => {
  const { dir } = repo();
  writeFileSync(join(dir, 'scratch.ts'), 'x\n');
  assert.equal(runBase(dir), 'main');
  assert.deepEqual(newFiles(dir), ['scratch.ts']);
});

test('the base is the commit the run began on, and its branch name is kept for people', () => {
  const { dir, git } = repo();
  const first = git('rev-parse', 'HEAD');
  start(dir);
  git('switch', '-q', '-c', 'agent/issue-17');
  writeFileSync(join(dir, 'b.ts'), 'b\n');
  git('add', 'b.ts');
  git('commit', '-q', '-m', 'the change');
  assert.equal(runBase(dir), first);
  assert.equal(runBaseName(dir), 'trial');
});

test('a recorded base that is not an ancestor of HEAD is refused', () => {
  const { dir, git } = repo();
  git('switch', '-q', '-c', 'elsewhere');
  writeFileSync(join(dir, 'c.ts'), 'c\n');
  git('add', 'c.ts');
  git('commit', '-q', '-m', 'elsewhere');
  start(dir);
  git('switch', '-q', 'trial');
  assert.throws(() => runBase(dir), /not an ancestor of HEAD/);
});

test("the person's untracked files are left out; only files the change adds are new", () => {
  const { dir } = repo();
  writeFileSync(join(dir, '_qa-seed.ts'), 'mine\n');
  start(dir);
  writeFileSync(join(dir, 'quiet-hours.ts'), 'the change\n');
  assert.deepEqual(newFiles(dir), ['quiet-hours.ts']);
});

test("one of the person's untracked files that changes during the run is part of the change", () => {
  const { dir } = repo();
  writeFileSync(join(dir, '_qa-seed.ts'), 'mine\n');
  writeFileSync(join(dir, 'untouched.ts'), 'also mine\n');
  start(dir);
  writeFileSync(join(dir, '_qa-seed.ts'), 'mine, edited by the change\n');
  assert.deepEqual(newFiles(dir), ['_qa-seed.ts']);
});
