---
name: setup
description: Install the sstack software factory into an Expo app - agent prompts, EAS workflows, guardrail scripts, QA and review briefs, and an AGENTS.md - then adapt it to this app. Use once per project, when asked to set up sstack, add the factory, or make a repo ready for factory-run.
disable-model-invocation: true
---

# Install the factory in this Expo app

You copy the factory into the project, then make every file true for this app. A factory file that describes a different app is worse than none: agents trust it.

The files to copy are in `factory/` next to this skill. The optional style rules are in `conventions/`.

Ask before you overwrite anything. Make no commit until the person has seen the result.

## 0. Preflight

- The project root has `package.json` with `expo` in its dependencies, and `app.json` or `app.config.*`. If not, stop: this is for Expo apps.
- It is a git repo and `git status --porcelain` is empty. If not, stop and say what is in the way, so the factory lands in one reviewable change.
- Read the `expo` major version in `package.json`. Expo changes between SDKs; fetch the docs for that version before you touch an Expo API.

## 1. Copy

First ask which half the person wants:

- **Local runner only** (`factory-run` on this Mac): `scripts/factory/`, the prompts in `.eas/agents/*.md`, and `AGENTS.md`. No workflows. Pick this when there is no paid Expo plan yet, or when the app's checks need services a cloud job would not have.
- **Local runner and cloud pipeline**: everything below.

Copy everything in `factory/` that the chosen half needs into the project root, keeping its paths: `.eas/`, `.github/`, `scripts/factory/`, `types/expo.d.ts`, `jest/style-stub.js`, `AGENTS.md`.

- If a file already exists, do not overwrite it. List each clash, show the difference, and ask whether to merge, keep theirs, or take ours.
- If the project already has an `AGENTS.md` or `CLAUDE.md`, merge: keep their rules, add the factory's sections, and ask about any rule that contradicts one of theirs.
- Make the `.sh` files executable.
- The retry job in `.eas/workflows/pr.yml` installs with `npm ci --ignore-scripts`, and `.github/workflows/agent-label.yml` with `npm ci`. If the app uses Yarn, pnpm or Bun, change them to its install command, still without install scripts in the retry job.
- The static job runs the pull request's code in the `development` environment. Tell the person to keep that environment free of secrets.
- The local runner reads the bundle ID with `scripts/factory/app-id.mjs`, from `app.json` or, for `app.config.ts` and `app.config.js`, from Expo's resolved config. The cloud's `.eas/agents/start-session.sh` reads only `app.json`, because it must not run project code beside tokens: for an app with `app.config.*`, ask how the cloud should get the ID.

## 2. Make it true for this app

Read the app before you write about it: its README, its routes and screens, its folders (`src/`, or `app/`, `components/` and `lib/` at the root), `package.json`, and `app.json` or `app.config.*`. If it already has an agent workflow, such as specs and tickets from mattpocock/skills, keep it: its tickets work as `factory-run`'s issues.

1. **Bundle ID.** In `.eas/workflows/pr.yml`, set `MAESTRO_APP_ID` to the app's iOS bundle identifier. A new Expo app has none, and older ones may have a placeholder such as `com.yourcompany.yourapp`: then ask the person for the real one, and set `ios.bundleIdentifier` and `android.package` in `app.json` too.
2. **AGENTS.md.**
   - "What this project is": draft two or three sentences from the code, show them, and let the person correct them. Remove the EDIT comment.
   - "Stack" and "Folder layout": describe what the project has, not what the template had. Remove any library or folder that is not there. Remove the EDIT comment.
   - "Conventions" and "Test IDs": keep the rules that fit. Where the app has no shared button, strings file or theme file, drop the rule or ask whether to add one.
   - "Rules and what enforces them": every row must name a check that exists in this project, or say "Nothing yet". Do not leave a row that points at a check you did not install.
3. **App facts.** Fill in `.eas/agents/app-facts.md` from the running app or the code: the first screen and how to get past it, the screens and their root testIDs, timings, and what looks like a bug but is correct. Mark anything you could not confirm.
4. **Risk and fix-scope paths.** `scripts/factory/risk.mjs` and `scripts/factory/fix-scope.mjs` name paths such as `src/lib/purchases` and `src/lib/strings.ts`. A rule for a path the app does not have never matches, so it does no harm. Add rules for this app's sensitive paths (payments, auth, persisted data), and run their tests.

## 3. Wire it in

- **package.json scripts.** Add these, and ask before replacing a script of the same name:
  - `"typecheck": "tsc --noEmit"` (TypeScript projects)
  - `"check:testids": "node scripts/factory/check-testids.mjs"`
  - `"test:factory": "node --test \"scripts/factory/*.test.mjs\""`
  - `"verify"`: the project's typecheck, its lint if it has one, `check:testids`, and its test run, chained with `&&`.
- **Commands.** List exactly those checks under Commands in `AGENTS.md`: the coding and fix agents run what that list says. For the cloud pipeline, the coding agent may run only the commands in its allowlist in `.eas/agents/run-agent.sh` (the `change` mode): make that list match, and keep each command exact.
- **Services.** If the tests or the Maestro flows need something running, such as a local Supabase stack, write that in `AGENTS.md` and the app facts, with the command that starts it.
- **.gitignore.** Add `agent-output/`, `.argent/` and `*.profraw`.
- **ESLint.** A new Expo app has no ESLint config until `npx expo lint` first runs, which creates it. Then add a block with `linterOptions: { noInlineConfig: true }`, so no comment can switch a rule off. `scripts/factory/check-guardrails.mjs` already fails an agent pull request that edits an ESLint config.
- **TypeScript.** `types/expo.d.ts` declares Expo's types, so the typecheck passes in CI, where the gitignored `expo-env.d.ts` does not exist. Add `"types": ["jest"]` to `compilerOptions` in `tsconfig.json` once Jest is in.
- **Tests.** If the app already has a test runner, such as Vitest, keep it and do not add Jest. Check that it does not pick up the factory's own `scripts/factory/*.test.mjs`, which run under `node --test`. The rest of this item is for an app with no tests at all.
- **Jest.** The factory's agents write tests and the pipeline runs them, so the app needs a test runner. If it has none, ask, then install with `npx expo install jest-expo jest @types/jest @react-native/jest-preset @testing-library/react-native -- --save-dev`. In the Jest config:
  - `"preset": "jest-expo"` and `"clearMocks": true`, so a stub in one test cannot leak into the next.
  - `"testPathIgnorePatterns": ["/node_modules/", "/.eas/", "/scripts/"]`. Without it Jest picks up the factory's own `*.test.mjs` files, which run under `node --test`, and fails. Add this even when the app already had Jest.
  - `"moduleNameMapper"`: `"\\.css$": "<rootDir>/jest/style-stub.js"` when the app imports CSS, and `"^@/assets/(.*)$": "<rootDir>/assets/$1"` when `tsconfig.json` maps `@/assets/*` outside `src/`.
  - If the app uses `react-native-reanimated`: `"resolver": "react-native-reanimated/jest/resolver"`, and a `setupFilesAfterEnv` file that calls `require('react-native-reanimated').setUpTests()`.
  - If the app has no test yet, add one that renders the first screen and finds its root testID, so the Jest run has something to pass. Put it outside `src/app/`: Expo Router treats every file there as a route.
- **Maestro.** The factory needs at least one flow in `.maestro/` that launches the app and asserts the first screen's root testID. If there is none, write it, and add the testID to the screen if it is missing.

## 4. Optional: the style rules

`conventions/eslint.config.reference.js` holds lint rules that enforce three AGENTS.md rules: no inline colours or size numbers, no hard-coded copy, and wrapped libraries imported only from `src/lib`. They assume a theme file, a strings file and a `src/lib` folder.

Ask whether to install them. If yes: add the rules to the project's ESLint config with this app's paths, copy `conventions/lint-rules.test.mjs` into `scripts/factory/` and change its probe paths to match, and put files that already break the rules on the exception list, so the list only shrinks. Then point the matching rows of the AGENTS.md table at ESLint.

## 5. Check

Run `npm run test:factory`, then `npm run verify`. Fix what the factory files cause. Report, and do not fix, failures that were there before. To tell them apart, check whether the failing file is one you added or changed.

A new Expo SDK 58 app fails its own typecheck in `src/components/app-tabs.web.tsx` and its own lint in `src/hooks/use-color-scheme.web.ts`. Those are template issues: report them, and say each needs a one-line fix before the pipeline's checks can pass.

## 6. Report

Tell the person, short:

- what was copied, merged or skipped, and each clash and how it was settled;
- what you wrote into AGENTS.md and the app facts that they should check;
- whether the style rules were installed;
- the check results;
- what the local runner needs on this Mac: Xcode with an iOS simulator, the Maestro CLI, and the argent MCP tools for QA (`npx @swmansion/argent@latest init`);
- for the cloud pipeline: a paid Expo plan with hosted simulators and Maestro jobs, then the one-time steps in the sstack README.

Then stop. The person commits.
