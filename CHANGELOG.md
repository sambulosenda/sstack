# Changelog

Each release bumps `version` in `.claude-plugin/plugin.json` and adds an entry here. `scripts/check-plugin.mjs` fails until both match.

## 0.2.0

- QA and review run as the plugin's own subagents, `sstack:qa` and `sstack:reviewer`, whose tool lists enforce what the briefs used to ask for. The reviewer has no shell.
- `factory-run` compares `git status` before and after the checkers, and voids the verdict of a checker that touched the project.

## 0.1.0

- First release: the `setup`, `factory-run`, `prd-to-issues`, `add-screen`, `add-analytics-event` and `fix-maestro-flow` skills, and the factory files `setup` installs.
- Pull request code runs only in a job with no secrets; only pull requests from the repository itself run the pipeline; Claude Code starts from an empty npm prefix.
- `setup` tested on a fresh `create-expo-app` (SDK 58).
