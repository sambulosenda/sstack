#!/usr/bin/env node
// Fails when a Maestro flow refers to a testID that no longer exists in the app.
//
// The end-to-end flows find elements by `id:`. If a change renames or removes a
// testID, the flow breaks on a simulator ten minutes later. This catches it in
// seconds, before any build is spent.
//
// Usage: node scripts/factory/check-testids.mjs [flowsDir] [sourceDir]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

function walk(dir, keep) {
  const found = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.git')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...walk(path, keep));
    else if (keep(name)) found.push(path);
  }
  return found;
}

/** Every `id: "..."` in a Maestro flow, with the file it came from. */
export function flowIds(text) {
  const ids = new Set();
  for (const match of text.matchAll(/^\s*(?:-\s*)?id:\s*["']?([^"'\s#]+)["']?\s*(?:#.*)?$/gm)) {
    // Skip regular expressions and interpolations: they cannot be checked statically.
    if (/[\\^$*+?()[\]{}|]/.test(match[1])) continue;
    ids.add(match[1]);
  }
  return ids;
}

/**
 * Removes comments, so a commented-out testID does not count and a comment that mentions testID
 * cannot run into the code after it. Block comments go whole; a line comment goes from // to the
 * end of the line, unless the // follows a colon, as in https://.
 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Every literal testID in a source file: testID="x", testID='x', testID={'x'}, testID: 'x'. */
export function sourceIds(text) {
  const ids = new Set();
  // The id must open and close with the same quote on the same line.
  for (const match of stripComments(text).matchAll(/testID\s*(?:=|:)\s*\{?\s*(["'`])([^"'`$\n]+)\1/g)) {
    ids.add(match[2]);
  }
  return ids;
}

export function findMissing(flows, sources) {
  const known = new Set();
  for (const text of sources) for (const id of sourceIds(text)) known.add(id);
  const missing = [];
  for (const [file, text] of flows) {
    for (const id of flowIds(text)) if (!known.has(id)) missing.push({ file, id });
  }
  return missing;
}

function main() {
  const flowsDir = process.argv[2] ?? '.maestro';
  const sourceDir = process.argv[3] ?? 'src';

  const flows = walk(flowsDir, (name) => /\.ya?ml$/.test(name)).map((path) => [
    relative('.', path),
    readFileSync(path, 'utf8'),
  ]);
  const sources = walk(sourceDir, (name) => /\.(tsx?|jsx?)$/.test(name) && !/\.test\./.test(name)).map(
    (path) => readFileSync(path, 'utf8')
  );

  const missing = findMissing(flows, sources);
  if (missing.length === 0) {
    console.log(`testIDs OK: every id used in ${flows.length} Maestro flow(s) exists in ${sourceDir}/.`);
    return;
  }

  console.error('These Maestro flows use a testID that does not exist in the app:\n');
  for (const { file, id } of missing) console.error(`  ${file}: ${id}`);
  console.error(
    '\nEither restore the testID in the component, or update the flow in the same change.'
  );
  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
