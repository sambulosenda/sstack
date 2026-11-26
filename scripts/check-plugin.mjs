#!/usr/bin/env node
// Checks the plugin before it ships, with no Claude sign-in needed, so it runs in CI:
//   - plugin.json and marketplace.json parse and agree on the plugin's name;
//   - the version has an entry in CHANGELOG.md;
//   - every skill and agent that plugin.json lists exists, with a name that matches its file
//     and a description, and every agent names its tools (an agent without a tools line gets
//     every tool, which is the opposite of what sstack's checkers are for);
//   - no tracked file holds a personal email address. The repo is public.
//
// Usage: node scripts/check-plugin.mjs [repo root]
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '.');
const problems = [];
const problem = (text) => problems.push(text);

function readJson(path) {
  try {
    return JSON.parse(readFileSync(join(root, path), 'utf8'));
  } catch (error) {
    problem(`${path}: does not parse (${error.message})`);
    return null;
  }
}

/** The key: value lines between the first two --- lines of a Markdown file. */
export function frontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split('\n')) {
    const field = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (field) fields[field[1]] = field[2].trim();
  }
  return fields;
}

const plugin = readJson('.claude-plugin/plugin.json');
const marketplace = readJson('.claude-plugin/marketplace.json');

if (plugin && marketplace) {
  if (!marketplace.plugins?.some((entry) => entry.name === plugin.name)) {
    problem(`marketplace.json lists no plugin named "${plugin.name}"`);
  }
}

if (plugin) {
  if (!/^\d+\.\d+\.\d+$/.test(plugin.version ?? '')) problem(`plugin.json: version "${plugin.version}" is not x.y.z`);
  const changelog = existsSync(join(root, 'CHANGELOG.md')) ? readFileSync(join(root, 'CHANGELOG.md'), 'utf8') : '';
  if (!changelog.includes(`## ${plugin.version}`)) {
    problem(`CHANGELOG.md has no "## ${plugin.version}" entry. Add one for this version.`);
  }

  for (const path of plugin.skills ?? []) {
    const file = join(root, path, 'SKILL.md');
    if (!existsSync(file)) {
      problem(`${path}: no SKILL.md`);
      continue;
    }
    const fields = frontmatter(readFileSync(file, 'utf8'));
    if (!fields) problem(`${path}/SKILL.md: no frontmatter`);
    else {
      if (fields.name !== basename(path)) problem(`${path}/SKILL.md: name "${fields.name}" is not "${basename(path)}"`);
      if (!fields.description) problem(`${path}/SKILL.md: no description`);
    }
  }

  for (const path of plugin.agents ?? []) {
    const file = join(root, path);
    if (!existsSync(file)) {
      problem(`${path}: missing`);
      continue;
    }
    const fields = frontmatter(readFileSync(file, 'utf8'));
    const name = basename(path, '.md');
    if (!fields) problem(`${path}: no frontmatter`);
    else {
      if (fields.name !== name) problem(`${path}: name "${fields.name}" is not "${name}"`);
      if (!fields.description) problem(`${path}: no description`);
      if (!fields.tools) problem(`${path}: no tools line, so the agent would get every tool`);
    }
  }
}

// Personal email addresses. GitHub's no-reply addresses and example domains are fine.
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const ALLOWED = /@(users\.noreply\.github\.com|noreply\.github\.com|example\.(com|org))$/;
for (const file of tracked) {
  if (/\.(png|jpe?g|gif|ico|webp)$/.test(file)) continue;
  const text = readFileSync(join(root, file), 'utf8');
  for (const address of text.match(EMAIL) ?? []) {
    if (!ALLOWED.test(address)) problem(`${file}: holds the email address ${address}`);
  }
}

if (problems.length > 0) {
  console.error(`check-plugin: ${problems.length} problem(s)\n${problems.map((text) => `  - ${text}`).join('\n')}`);
  process.exit(1);
}
console.log(
  `check-plugin OK: ${plugin.skills.length} skills, ${(plugin.agents ?? []).length} agents, version ${plugin.version}, ${tracked.length} files without personal email addresses.`
);
