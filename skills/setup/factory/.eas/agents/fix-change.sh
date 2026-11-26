#!/usr/bin/env bash
# Retry loop. When the checks fail on a pull request that the agent opened, this script
# gives the failure back to the coding agent, which pushes a fix to the same branch.
# The push starts the checks again. After MAX_FIX_ATTEMPTS it stops and asks for a person.
#
# Runs in the retry job of .eas/workflows/pr.yml. Built on the same pattern as Expo's
# make-change.sh (https://docs.expo.dev/agentic-workflows/issue-to-pr/).
set -euo pipefail

: "${PR_NUMBER:?No pull request number.}"
: "${BRANCH:?No branch name.}"
: "${GITHUB_TOKEN:?GITHUB_TOKEN is not set. Add it to the preview environment.}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is not set. Add it to the preview environment.}"

MAX_ATTEMPTS=${MAX_FIX_ATTEMPTS:-2}
PROJECT_DIR=$(pwd)
HELPER="$PROJECT_DIR/.eas/agents/github.mjs"
HEAD_SHA=${HEAD_SHA:-}
SHORT_SHA=${HEAD_SHA:0:7}

# Only pull requests that the agent opened get a retry. A person's PR is theirs to fix.
case "$BRANCH" in
  agent/issue-*) ISSUE_NUMBER=${BRANCH#agent/issue-} ;;
  *)
    echo "Branch $BRANCH is not an agent branch. Nothing to do."
    exit 0
    ;;
esac
case "$ISSUE_NUMBER" in
  '' | *[!0-9]*)
    echo "Branch $BRANCH does not end in an issue number. Nothing to do."
    exit 0
    ;;
esac

hand_off() {
  printf '## Agent retry\n\n%s\n\nA person needs to look at this pull request. [Workflow run](%s)\n' \
    "$1" "${RUN_URL:-}" > /tmp/retry-comment.md
  node "$HELPER" comment "$PR_NUMBER" /tmp/retry-comment.md
  node "$HELPER" add-labels "$PR_NUMBER" needs-human || true
}

# 1. A failure the coding agent is not allowed to fix.
if [ "${BUILD_STATUS:-}" = failure ] || [ "${REPACK_STATUS:-}" = failure ]; then
  hand_off "The native build or the repack failed, so the checks could not run. The coding agent cannot change native configuration."
  exit 0
fi

# 2. The attempt limit. Fix commits are counted on the branch, so the count survives reruns.
ATTEMPTS=$(node "$HELPER" count-commits "$PR_NUMBER" "Agent fix attempt")
if [ "$ATTEMPTS" -ge "$MAX_ATTEMPTS" ]; then
  hand_off "The checks still fail after $ATTEMPTS fix attempt(s). The limit is $MAX_ATTEMPTS."
  exit 0
fi
ATTEMPT=$((ATTEMPTS + 1))

REPO_DIR=$(git rev-parse --show-toplevel)
APP_PATH=$(git rev-parse --show-prefix)
WORK_DIR=/tmp/agent-fix
APP_DIR="$WORK_DIR/$APP_PATH"
PUSH_URL="https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"

source "$PROJECT_DIR/.eas/agents/clones.sh"
HELPER=$(trusted_copy "$HELPER")
agent_clone "$WORK_DIR" "$BRANCH"

# If the branch moved on while this run was going, a newer run owns the result.
if [ -n "$HEAD_SHA" ] && [ "$BASE_SHA" != "$HEAD_SHA" ]; then
  echo "The branch has a newer commit than the one this run tested. The newer run handles it."
  exit 0
fi

# Runs one scripted check in the clone and prints the result as markdown. The clone holds code
# that an agent wrote, and a check runs that code (tests, lint config), so it gets no tokens.
run_check() {
  local name=$1
  shift
  printf '#### %s\n\n' "$name"
  if (cd "$APP_DIR" && env -i PATH="$PATH" HOME="$HOME" TMPDIR="${TMPDIR:-/tmp}" LANG="${LANG:-C.UTF-8}" CI=1 "$@" > /tmp/check.log 2>&1); then
    printf 'Passed.\n\n'
  else
    printf 'Failed. The end of the output:\n\n```\n'
    tail -n 120 /tmp/check.log
    printf '\n```\n\n'
  fi
}

{
  cat .eas/agents/fix-change.md
  printf '\n## What failed (fix attempt %s of %s)\n\n' "$ATTEMPT" "$MAX_ATTEMPTS"

  if [ "${STATIC_STATUS:-}" = failure ]; then
    printf '### Scripted checks\n\n'
    # The guardrails check reads the diff from GitHub, so it alone keeps the token. Agents
    # cannot change scripts/factory, so this is the pipeline's code, not the agent's.
    run_check 'node scripts/factory/check-guardrails.mjs' env GITHUB_TOKEN="$GITHUB_TOKEN" node scripts/factory/check-guardrails.mjs
    run_check 'npx tsc --noEmit' npx tsc --noEmit
    run_check 'npx expo lint' npx expo lint
    run_check 'node scripts/factory/check-testids.mjs' node scripts/factory/check-testids.mjs
    run_check 'npx jest --ci' npx jest --ci
  fi

  if [ "${E2E_STATUS:-}" = failure ]; then
    printf '### Maestro flows\n\n'
    REPORT=$(node "$HELPER" last-comment "$PR_NUMBER" "## Maestro results ($SHORT_SHA)" || true)
    if [ -n "$REPORT" ]; then
      printf '%s\n\n' "$REPORT"
    else
      printf 'At least one flow in .maestro failed on a simulator, and no report was captured. Read the flows. Check that each testID and each visible text they use still exists, and that the navigation they follow still works.\n\n'
    fi
  fi

  case "${VERDICT:-}" in
    FAIL*)
      printf '### Agent QA on a simulator\n\n**Verdict:** %s\n\n' "$VERDICT"
      REPORT=$(node "$HELPER" last-comment "$PR_NUMBER" "## Agent QA report ($SHORT_SHA)" || true)
      if [ -n "$REPORT" ]; then
        printf '%s\n\n' "$REPORT"
      fi
      ;;
  esac

  printf '## Pull request #%s\n\n%s\n\n%s\n\n' "$PR_NUMBER" "${PR_TITLE:-}" "${PR_BODY:-}"
  printf '## Issue #%s\n\n' "$ISSUE_NUMBER"
  node "$HELPER" issue "$ISSUE_NUMBER"
} > "$APP_DIR/agent-output/prompt.md"

cd "$APP_DIR"
env -u EXPO_TOKEN -u EXPO_TOKEN_SIMULATOR -u GITHUB_TOKEN \
  timeout 20m bash .eas/agents/run-agent.sh agent-output/prompt.md change || true

# From here on the agent clone is untrusted (see clones.sh). Copy its files into a clean clone
# of the branch, and check, commit and push there.
SUMMARY=$(agent_file "$APP_DIR/agent-output/summary.md")
cd "$PROJECT_DIR"
# A new folder with a random name, so nothing that an agent left running can be waiting in it.
PUSH_DIR=$(mktemp -d)/repo
clone_repo "$PUSH_DIR" "$BRANCH"
if [ "$(git -C "$PUSH_DIR" rev-parse HEAD)" != "$BASE_SHA" ]; then
  echo "The branch got a newer commit while the agent worked. The newer run handles it."
  exit 0
fi
copy_work_tree "$WORK_DIR" "$PUSH_DIR"
cd "$PUSH_DIR"

if [ -n "$(git status --porcelain -- "${APP_PATH}.eas" .github "${APP_PATH}scripts/factory")" ]; then
  hand_off "On fix attempt $ATTEMPT the agent changed files in .eas, .github or scripts/factory. That is not allowed, so nothing was pushed."
  exit 0
fi

if [ -z "$(git status --porcelain)" ]; then
  REASON=$(head -n 1 "$SUMMARY" 2> /dev/null || true)
  hand_off "On fix attempt $ATTEMPT the agent did not change any file. ${REASON}"
  exit 0
fi

TITLE=$(head -n 1 "$SUMMARY" 2> /dev/null || true)
TITLE=${TITLE:-"Fix the failing checks"}
AUTHOR_EMAIL=$(node "$HELPER" author-email)
git add -A
git -c user.name="Expo agent" -c user.email="$AUTHOR_EMAIL" commit -m "Agent fix attempt $ATTEMPT: $TITLE"
git push "$PUSH_URL" "HEAD:refs/heads/$BRANCH"

{
  printf '## Agent retry\n\n**Fix attempt %s of %s:** %s\n\n' "$ATTEMPT" "$MAX_ATTEMPTS" "$TITLE"
  tail -n +2 "$SUMMARY" 2> /dev/null || true
  printf '\n\nThe checks run again on the new commit.\n'
} > /tmp/retry-comment.md
node "$HELPER" comment "$PR_NUMBER" /tmp/retry-comment.md
