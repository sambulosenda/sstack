import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { newFiles, runBase, start } from './local-run.mjs';

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'local-run-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
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

test('start records the branch the run began on, even after switching to the agent branch', () => {
  const { dir, git } = repo();
  start(dir);
  git('switch', '-q', '-c', 'agent/issue-17');
  assert.equal(runBase(dir), 'trial');
});

test("the person's untracked files are left out; only files the change adds are new", () => {
  const { dir } = repo();
  writeFileSync(join(dir, '_qa-seed.ts'), 'mine\n');
  start(dir);
  writeFileSync(join(dir, 'quiet-hours.ts'), 'the change\n');
  assert.deepEqual(newFiles(dir), ['quiet-hours.ts']);
});
