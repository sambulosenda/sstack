#!/usr/bin/env bash
# Job script for Issue to PR. Clones the default branch, asks a read-only agent whether the
# issue is ready (triage), runs the agent in change mode, refuses changes to .eas, .github or
# scripts/factory,
# then pushes agent/issue-<number> and opens a PR.
# From Expo's guide: https://docs.expo.dev/agentic-workflows/issue-to-pr/
set -euo pipefail

: "${ISSUE_NUMBER:?No issue number. Pass -F issue_number=<number>.}"
: "${GITHUB_TOKEN:?GITHUB_TOKEN is not set. Add it to the preview environment.}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is not set. Add it to the preview environment.}"

PROJECT_DIR=$(pwd)
REPO_DIR=$(git rev-parse --show-toplevel)
APP_PATH=$(git rev-parse --show-prefix)
WORK_DIR=/tmp/agent-change
APP_DIR="$WORK_DIR/$APP_PATH"
BRANCH="agent/issue-$ISSUE_NUMBER"
GITHUB_HELPER="$PROJECT_DIR/.eas/agents/github.mjs"
PUSH_URL="https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"

# Daily limit (added to Expo's script). Each agent pull request costs a build or a repack,
# simulator time and model tokens, and each can retry twice. Stop a runaway day here.
MAX_PER_DAY=${MAX_AGENT_PRS_PER_DAY:-10}
OPENED_TODAY=$(node "$GITHUB_HELPER" count-recent-agent-prs 24)
if [ "$OPENED_TODAY" -ge "$MAX_PER_DAY" ]; then
  printf '## Issue to PR\n\nNot started. The agent opened %s pull requests in the last 24 hours and the limit is %s. Add the `agent` label again tomorrow, or raise `MAX_AGENT_PRS_PER_DAY` in `.eas/workflows/issue-to-pr.yml`.\n' "$OPENED_TODAY" "$MAX_PER_DAY" > /tmp/comment.md
  node "$GITHUB_HELPER" comment "$ISSUE_NUMBER" /tmp/comment.md
  exit 1
fi

source "$PROJECT_DIR/.eas/agents/clones.sh"
GITHUB_HELPER=$(trusted_copy "$GITHUB_HELPER")
agent_clone "$WORK_DIR"

node "$GITHUB_HELPER" issue "$ISSUE_NUMBER" > /tmp/issue.json

cd "$APP_DIR"

# Triage (added to Expo's script). Before any code is written, an agent that can only read
# decides whether the issue is ready to build. If a product decision is open, it posts its
# questions on the issue and the job stops. Answer in a comment, then add the `agent` label
# again. Set TRIAGE to off in .eas/workflows/issue-to-pr.yml to skip this step.
if [ "${TRIAGE:-on}" != off ]; then
  {
    cat "$PROJECT_DIR/.eas/agents/triage.md"
    printf '\n## Issue #%s\n\n' "$ISSUE_NUMBER"
    cat /tmp/issue.json
  } > agent-output/triage-prompt.md
  env -u EXPO_TOKEN -u EXPO_TOKEN_SIMULATOR -u GITHUB_TOKEN \
    timeout 10m bash .eas/agents/run-agent.sh agent-output/triage-prompt.md triage || true

  TRIAGE_FILE=$(agent_file agent-output/triage.md)
  TRIAGE_VERDICT=$(head -n 1 "$TRIAGE_FILE")
  case "$TRIAGE_VERDICT" in
    ASK*)
      {
        printf '## Issue triage\n\nNot started. %s\n\n' "${TRIAGE_VERDICT#ASK: }"
        tail -n +2 "$TRIAGE_FILE"
        printf '\n\nAnswer in a comment on this issue, then add the `agent` label again. To build the issue as it is, say so in a comment.\n'
      } > /tmp/comment.md
      node "$GITHUB_HELPER" comment "$ISSUE_NUMBER" /tmp/comment.md
      node "$GITHUB_HELPER" add-labels "$ISSUE_NUMBER" needs-spec || true
      node "$GITHUB_HELPER" remove-label "$ISSUE_NUMBER" agent || true
      exit 0
      ;;
    BUILD*)
      node "$GITHUB_HELPER" remove-label "$ISSUE_NUMBER" needs-spec || true
      ;;
    *)
      # No verdict means the triage agent broke, not that the issue is bad. Build anyway.
      echo "Triage wrote no verdict. Continuing to the change." >&2
      ;;
  esac

  # The triage agent only reads, but nothing stops it writing. Start the change from a new clone.
  cd "$PROJECT_DIR"
  agent_clone "$WORK_DIR"
  cd "$APP_DIR"
fi

{
  cat "$PROJECT_DIR/.eas/agents/make-change.md"
  printf '\n## Issue #%s\n\n' "$ISSUE_NUMBER"
  cat /tmp/issue.json
} > agent-output/prompt.md

env -u EXPO_TOKEN -u EXPO_TOKEN_SIMULATOR -u GITHUB_TOKEN \
  timeout 20m bash .eas/agents/run-agent.sh agent-output/prompt.md change || true

# From here on the agent clone is untrusted (see clones.sh). Copy its files into a clean clone
# of the same commit, and check, commit and push there.
SUMMARY=$(agent_file "$APP_DIR/agent-output/summary.md")
cd "$PROJECT_DIR"
# A new folder with a random name, so nothing that an agent left running can be waiting in it.
PUSH_DIR=$(mktemp -d)/repo
clone_repo "$PUSH_DIR"
if [ "$(git -C "$PUSH_DIR" rev-parse HEAD)" != "$BASE_SHA" ]; then
  # The default branch moved while the agent worked. Use the commit that the agent started from.
  git -C "$PUSH_DIR" fetch --quiet --depth 1 "$PUSH_URL" "$BASE_SHA"
  git -C "$PUSH_DIR" checkout --quiet --detach "$BASE_SHA"
fi
copy_work_tree "$WORK_DIR" "$PUSH_DIR"
cd "$PUSH_DIR"

if [ -n "$(git status --porcelain -- "${APP_PATH}.eas" .github "${APP_PATH}scripts/factory")" ]; then
  echo "The agent changed files in .eas, .github or scripts/factory. The job does not open a pull request." >&2
  exit 1
fi

if [ -z "$(git status --porcelain)" ]; then
  {
    printf '## Issue to PR\n\nThe agent did not change any file.\n\n'
    cat "$SUMMARY" 2> /dev/null || true
  } > /tmp/comment.md
  node "$GITHUB_HELPER" comment "$ISSUE_NUMBER" /tmp/comment.md
  exit 1
fi

TITLE=$(head -n 1 "$SUMMARY" 2> /dev/null || true)
TITLE=${TITLE:-"Change for issue #$ISSUE_NUMBER"}
{
  tail -n +2 "$SUMMARY" 2> /dev/null || true
  printf '\n\nCloses #%s\n' "$ISSUE_NUMBER"
} > /tmp/pull-request.md

AUTHOR_EMAIL=$(node "$GITHUB_HELPER" author-email)
git checkout -b "$BRANCH"
git add -A
git -c user.name="Expo agent" -c user.email="$AUTHOR_EMAIL" commit -m "$TITLE"
git push --force "$PUSH_URL" "HEAD:refs/heads/$BRANCH"
PR_URL=$(node "$GITHUB_HELPER" open-pull-request "$BRANCH" "$TITLE" /tmp/pull-request.md)

printf '## Issue to PR\n\nThe agent opened %s.\n' "$PR_URL" > /tmp/comment.md
node "$GITHUB_HELPER" comment "$ISSUE_NUMBER" /tmp/comment.md
