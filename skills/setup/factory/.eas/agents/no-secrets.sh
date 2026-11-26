#!/usr/bin/env bash
# Runs a command with every secret of the preview environment removed from its environment.
# Use it for each step that runs code from the pull request: installing packages (lifecycle
# scripts), lint (the config is code), tests and the type checker. That code may come from an
# agent that a prompt injection steered, so it must never see a token or a model key.
# Agents cannot change .eas/ (make-change.sh and fix-change.sh refuse it), so this file can be trusted.
#
# Usage: bash .eas/agents/no-secrets.sh <command> [args...]
exec env -u GITHUB_TOKEN -u EXPO_TOKEN -u EXPO_TOKEN_SIMULATOR -u ANTHROPIC_API_KEY \
  -u CLAUDE_CODE_OAUTH_TOKEN "$@"
