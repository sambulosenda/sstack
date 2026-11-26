# Changelog

Each release bumps `version` in `.claude-plugin/plugin.json` and adds an entry here. `scripts/check-plugin.mjs` fails until both match.

## 0.3.0

Works in any Expo app, not only one shaped like the starter. Everything here was found by a trial on a second app: Expo Router at the root, Bun, Supabase with pgTAP and Vitest, tickets from mattpocock/skills, and a quiet-hours ticket taken through every station.

- **Any project shape.**
  - `scripts/factory/app-id.mjs` reads the bundle ID from `app.json` or from the resolved `app.config.*`.
  - `check-testids` reads every app code folder that exists.
  - `factory-run` takes mattpocock-style tickets, installs with the project's package manager, and checks the services the tests need.
  - The change and fix prompts run the checks `AGENTS.md` lists under Commands.
- **Any base branch, and your own files left alone.** `scripts/factory/local-run.mjs start` records the branch the run began on and the untracked files already there. Before, prepare-checks marked every untracked file as part of the change, and the guardrails counted them. The guardrails, the review diff and `fix-scope` now compare with that branch and leave those files out.
- **`fix-scope` sees app code anywhere.** It used to count only `src/`, so it rated a fix to `lib/` and two new migrations "0 changed lines of app code". App code is now any code or SQL file outside tests and the factory. A new migration is new behaviour.
- **The build script.**
  - It turns Sentry's source-map upload off for the simulator build.
  - It launches the app once and exits 3, with the crash from the simulator's log, when the app closes as it opens. Before, a crash at launch read as every flow failing.
  - It runs only `.maestro/factory/` when that folder exists, and points at the "Open in <app>?" prompt when every flow fails.
- **The briefs and prompts.**
  - The review brief lists all code and SQL, not only `src/`-style folders, and asks the reviewer to open the earlier definition of anything a change redefines.
  - The change and review prompts follow `AGENTS.md` on how the flows find elements (testIDs or labels), which test framework to use, and which generated files to regenerate.
- **setup.**
  - It looks for generated files that CI checks, such as a database function snapshot, and lists them in `AGENTS.md`.
  - It offers a local-runner-only install.
  - It runs the build script once before any issue, so a crash at launch or a system prompt shows up at setup.

## 0.2.0

- QA and review run as the plugin's own subagents, `sstack:qa` and `sstack:reviewer`, whose tool lists enforce what the briefs used to ask for. The reviewer has no shell.
- `factory-run` compares `git status` before and after the checkers, and voids the verdict of a checker that touched the project.

## 0.1.0

- First release: the `setup`, `factory-run`, `prd-to-issues`, `add-screen`, `add-analytics-event` and `fix-maestro-flow` skills, and the factory files `setup` installs.
- Pull request code runs only in a job with no secrets; only pull requests from the repository itself run the pipeline; Claude Code starts from an empty npm prefix.
- `setup` tested on a fresh `create-expo-app` (SDK 58).
