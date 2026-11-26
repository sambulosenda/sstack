#!/usr/bin/env bash
# Code review by an agent, before a person reads the diff. Agent QA tests what the app does;
# this reads what the code is. It posts its findings on the pull request. The verdict is advice:
# it does not fail the checks and does not start a retry.
#
# Runs in the review job of .eas/workflows/pr.yml. The agent can only read the project and
# write its report, and it gets no tokens. Specific to this template.
set -euo pipefail

: "${PR_NUMBER:?No pull request number.}"
: "${GITHUB_TOKEN:?GITHUB_TOKEN is not set. Add it to the preview environment.}"
: "${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is not set. Add it to the preview environment.}"

source .eas/agents/clones.sh
# The agent can write files. Keep the script that later runs with the token out of its reach.
HELPER=$(trusted_copy .eas/agents/github.mjs)
SHORT_SHA=${HEAD_SHA:0:7}
BRANCH=${BRANCH:-}
mkdir -p agent-output/evidence

node "$HELPER" diff "$PR_NUMBER" > agent-output/pr.diff

# On an agent pull request (branch agent/issue-<n>) the reviewer also gets the issue, so it can
# tell what was asked for from what was done.
ISSUE_NUMBER=''
case "$BRANCH" in agent/issue-*) ISSUE_NUMBER=${BRANCH#agent/issue-} ;; esac
case "$ISSUE_NUMBER" in *[!0-9]*) ISSUE_NUMBER='' ;; esac
ISSUE=''
if [ -n "$ISSUE_NUMBER" ]; then
  ISSUE=$(node "$HELPER" issue "$ISSUE_NUMBER" 2> /dev/null || true)
fi

{
  cat .eas/agents/review.md
  printf '\n## Pull request\n\n%s\n\n%s\n\n' "${PR_TITLE:-}" "${PR_BODY:-}"
  if [ -n "$ISSUE" ]; then
    printf '## Issue #%s\n\n%s\n\n' "$ISSUE_NUMBER" "$ISSUE"
  fi
} > agent-output/prompt.md

env -u EXPO_TOKEN -u EXPO_TOKEN_SIMULATOR -u GITHUB_TOKEN \
  timeout 15m bash .eas/agents/run-agent.sh agent-output/prompt.md review || true

REVIEW_FILE=$(agent_file agent-output/evidence/review.md)
VERDICT=$(head -n 1 "$REVIEW_FILE")
case "$VERDICT" in
  APPROVE* | CHANGES*) ;;
  *)
    echo "The review agent wrote no verdict. Nothing is posted." >&2
    exit 0
    ;;
esac

{
  printf '## Agent review (%s)\n\n**%s** (advisory)\n\n' "$SHORT_SHA" "$VERDICT"
  tail -n +2 "$REVIEW_FILE"
} > /tmp/review-comment.md
node "$HELPER" comment "$PR_NUMBER" /tmp/review-comment.md
