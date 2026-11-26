#!/usr/bin/env bash
# Runs Claude Code without a person. Usage: bash .eas/agents/run-agent.sh <prompt-file> <mode>
#   device: the agent tests the app on a remote simulator. It cannot edit code.
#   change: the agent edits code. It cannot touch a device.
#   triage, review: the agent reads the project and writes a verdict. It cannot run anything.
#
# From Expo's setup guide (Claude Code runner):
# https://docs.expo.dev/agentic-workflows/setup/#add-the-agent-runner
# Changed here: the change mode may also run the linter, the unit tests and the testID check.
#
# Needs CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY in the preview environment.
set -euo pipefail

case "$2" in
  device) tools='Read,Glob,Grep,Write,Bash(npx --yes eas-cli@27.10.0 simulator:exec npx --yes agent-device@0.21.37 *),Bash(npx --yes -p @swmansion/argent@0.33.0 argent *)' ;;
  triage | review) tools='Read,Glob,Grep,Write' ;;
  change) tools='Read,Glob,Grep,Edit,Write,Bash(npx tsc --noEmit),Bash(npx expo lint),Bash(npx jest --ci),Bash(npx jest --ci *),Bash(node scripts/factory/check-testids.mjs)' ;;
  *)
    echo "Unknown mode \"$2\". Use device, change, triage or review." >&2
    exit 1
    ;;
esac

mkdir -p agent-output/evidence
# From an empty prefix, so a package of the same name planted in the project's node_modules
# (a lockfile can point it anywhere) never runs with the model key. Plain npx would run it.
npm exec --yes --prefix "$(mktemp -d)" --package=@anthropic-ai/claude-code@2.1.325 -- \
  claude -p "Do the task that standard input describes." \
  --allowedTools "$tools" --permission-mode dontAsk --max-turns 80 \
  --output-format stream-json --verbose < "$1" > agent-output/evidence/agent-log.jsonl || {
  tail -n 1 agent-output/evidence/agent-log.jsonl >&2
  exit 1
}
