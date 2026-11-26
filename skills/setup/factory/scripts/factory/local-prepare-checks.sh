#!/usr/bin/env bash
# Local runner, stations 6 and 7: gets QA and review ready, so each starts from the same state
# on every run. Used by the factory-run skill.
#
# Usage: bash scripts/factory/local-prepare-checks.sh <issue file> <simulator UDID> [<fix base>]
#   With a fix base (the commit QA and review last saw), the review covers only the fix made
#   since then: see scripts/factory/fix-scope.mjs.
#
# It reinstalls the app, so QA starts on onboarding like a new user. It clears old evidence,
# writes the review folder (agent-output/review/: pr.diff, issue.md, summary.md), and writes the
# two briefs to hand to the fresh subagents: agent-output/qa-brief.md and
# agent-output/review-brief.md. Run local-build-test.sh first: it writes the app's path.
set -euo pipefail

ISSUE=${1:?Usage: bash scripts/factory/local-prepare-checks.sh <issue file> <simulator UDID> [<fix base>]}
UDID=${2:?Usage: bash scripts/factory/local-prepare-checks.sh <issue file> <simulator UDID> [<fix base>]}
FIX_BASE=${3:-}
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
OUT=agent-output
TEMPLATES=scripts/factory/briefs

[ -f "$ISSUE" ] || { echo "No issue file at $ISSUE" >&2; exit 1; }
[ -f "$OUT/summary.md" ] || { echo "No $OUT/summary.md: write the summary first" >&2; exit 1; }
[ -f "$OUT/app-path.txt" ] || { echo "No $OUT/app-path.txt: run local-build-test.sh first" >&2; exit 1; }
APP=$(cat "$OUT/app-path.txt")
BUNDLE_ID=$(node -p "require('./app.json').expo.ios.bundleIdentifier")

# A fresh install, as the cloud pipeline tests: the Maestro flows leave the app past onboarding.
xcrun simctl uninstall "$UDID" "$BUNDLE_ID" || true
xcrun simctl install "$UDID" "$APP"
xcrun simctl launch "$UDID" "$BUNDLE_ID" > /dev/null

# QA and review each get a folder of their own, so neither reads the other's files.
rm -rf "$OUT/evidence" "$OUT/review"
mkdir -p "$OUT/evidence" "$OUT/review"

# New files must be in the diff: mark them as intended, without staging their content.
git ls-files --others --exclude-standard -z | xargs -0 git add -N --
BASE=${FIX_BASE:-main}
git diff "$BASE" > "$OUT/review/pr.diff"
cp "$ISSUE" "$OUT/review/issue.md"
cp "$OUT/summary.md" "$OUT/review/summary.md"

if [ -n "$FIX_BASE" ]; then
  KIND="This is a re-check of a fix made after QA and review had already run on the change. Nobody has reviewed the fix itself. The description says which findings it addresses. Judge whether it really fixes them, and whether it breaks anything or adds a new problem. The diff covers only the fix."
else
  KIND="This is the first review of the change."
fi

ROOT="$ROOT" ISSUE="$ISSUE" UDID="$UDID" BUNDLE_ID="$BUNDLE_ID" APP="$APP" KIND="$KIND" \
  CHANGED="$(git diff --name-only "$BASE")" ISSUES="$(git ls-files docs/issues)" SOURCES="$(git ls-files src)" \
  TEMPLATES="$TEMPLATES" OUT="$OUT" node -e '
    const fs = require("fs");
    const env = process.env;
    const list = (lines) => lines.split("\n").filter(Boolean).map((file) => `- ${file}`).join("\n");
    const values = {
      PROJECT: env.ROOT,
      ISSUE: env.ISSUE,
      UDID: env.UDID,
      BUNDLE_ID: env.BUNDLE_ID,
      APP_PATH: env.APP,
      REVIEW_KIND: env.KIND,
      CHANGED_FILES: list(env.CHANGED),
      // Six reviewers in a row ran ls, against their rules, to find these.
      ISSUE_FILES: list(env.ISSUES),
      SOURCE_FILES: list(env.SOURCES),
    };
    for (const name of ["qa-brief.md", "review-brief.md"]) {
      let text = fs.readFileSync(`${env.TEMPLATES}/${name}`, "utf8");
      for (const [key, value] of Object.entries(values)) text = text.replaceAll(`{{${key}}}`, value);
      const left = text.match(/\{\{[A-Z_]+\}\}/);
      if (left) throw new Error(`${name} still has ${left[0]}`);
      fs.writeFileSync(`${env.OUT}/${name}`, text);
    }
  '

echo "QA: the app is freshly installed and open. Brief: $OUT/qa-brief.md"
echo "Review: $(wc -l < "$OUT/review/pr.diff" | tr -d " ") diff lines against $BASE. Brief: $OUT/review-brief.md"
