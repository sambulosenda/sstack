#!/usr/bin/env node
// Prints the app's iOS bundle identifier, for the local runner's scripts.
// It reads app.json when the ID is there, and otherwise asks Expo for the resolved config, which
// is how an app.config.ts or app.config.js is read. That runs the project's config code, so only
// the local runner uses this, never a cloud job that holds tokens.
//
// Usage: node scripts/factory/app-id.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

function fromAppJson() {
  if (!existsSync('app.json')) return '';
  try {
    return JSON.parse(readFileSync('app.json', 'utf8')).expo?.ios?.bundleIdentifier ?? '';
  } catch {
    return '';
  }
}

function fromExpoConfig() {
  const json = execFileSync('npx', ['expo', 'config', '--json', '--type', 'public'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(json).ios?.bundleIdentifier ?? '';
}

const id = fromAppJson() || fromExpoConfig();
if (!id) {
  console.error('No iOS bundle identifier in the app config. Set ios.bundleIdentifier.');
  process.exit(1);
}
console.log(id);
