#!/usr/bin/env bash
# Local runner, station 4: builds a Release app for an iOS simulator and runs the Maestro flows.
# Used by the factory-run skill. Each step here was typed by hand on every local run before.
#
# Usage: bash scripts/factory/local-build-test.sh <simulator UDID>
# Writes agent-output/build.log, agent-output/maestro.log and agent-output/app-path.txt.
# Runs the flows in .maestro/factory/ when that folder exists, and otherwise every flow in .maestro/.
# An app whose flows need inputs prepared by hand keeps them outside .maestro/factory/.
# Exit code: 0 when the build and every flow pass, 1 when the build fails, 2 when a flow fails.
set -uo pipefail

UDID=${1:?Usage: bash scripts/factory/local-build-test.sh <simulator UDID>}
cd "$(git rev-parse --show-toplevel)"
OUT=agent-output
mkdir -p "$OUT"
BUNDLE_ID=$(node scripts/factory/app-id.mjs)

# The build rewrites the ios and android scripts in package.json. Restore the file from a copy,
# not from git: git checkout would also throw away a change the issue made to package.json.
cp package.json "$OUT/package.json.before"
# Without a UTF-8 locale CocoaPods crashes ("Unicode Normalization not appropriate for ASCII-8BIT").
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo run:ios --configuration Release --no-bundler \
  --device "$UDID" > "$OUT/build.log" 2>&1
BUILD=$?
cp "$OUT/package.json.before" package.json

APP=$(grep -o '/[^ ]*Release-iphonesimulator/[^ /]*\.app' "$OUT/build.log" | tail -n 1)
if [ "$BUILD" -ne 0 ] || [ -z "$APP" ]; then
  echo "build: FAILED. A native build failure is not the coding agent's to fix. End of $OUT/build.log:"
  tail -n 8 "$OUT/build.log"
  exit 1
fi
printf '%s\n' "$APP" > "$OUT/app-path.txt"
echo "build: passed. App: $APP"

MAESTRO=${MAESTRO:-$HOME/.maestro/bin/maestro}
if [ ! -x "$MAESTRO" ]; then
  echo "maestro: not run, it is not installed at $MAESTRO"
  exit 0
fi

FLOWS_DIR=.maestro
[ -d .maestro/factory ] && FLOWS_DIR=.maestro/factory
echo "maestro: running the flows in $FLOWS_DIR"

run_flows() {
  "$MAESTRO" --udid "$UDID" test "$FLOWS_DIR" -e MAESTRO_APP_ID="$BUNDLE_ID" \
    --test-output-dir "$OUT/maestro" > "$OUT/maestro.log" 2>&1
}
run_flows
FLOWS=$?
# Maestro itself sometimes crashes with a stack trace and no failed flow (issue 05). Run once
# more in that case only; a flow that failed is a real result and is not retried.
if [ "$FLOWS" -ne 0 ] && ! grep -q '\[Failed\]' "$OUT/maestro.log"; then
  echo "maestro: crashed without a failed flow. First lines of the crash:"
  grep -m 3 -i 'exception\|error' "$OUT/maestro.log" || true
  echo "maestro: running once more"
  run_flows
  FLOWS=$?
fi
grep -E '\[(Passed|Failed)\]|Flows' "$OUT/maestro.log"
if [ "$FLOWS" -ne 0 ]; then
  # Every flow failing at once is usually not the change: a system prompt can cover the app, such
  # as "Open in <app>?" the first time a new URL scheme opens it. Look at the simulator first.
  if ! grep -q '\[Passed\]' "$OUT/maestro.log"; then
    echo "maestro: every flow failed. Check the simulator for a system prompt covering the app before blaming the change."
  fi
  echo "maestro: FAILED. See $OUT/maestro.log"
  exit 2
fi
echo "maestro: passed"
