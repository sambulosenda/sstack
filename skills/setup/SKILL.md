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

Copy everything in `factory/` into the project root, keeping its paths: `.eas/`, `.github/`, `scripts/factory/`, `AGENTS.md`.

- If a file already exists, do not overwrite it. List each clash, show the difference, and ask whether to merge, keep theirs, or take ours.
- If the project already has an `AGENTS.md` or `CLAUDE.md`, merge: keep their rules, add the factory's sections, and ask about any rule that contradicts one of theirs.
- Make the `.sh` files executable.

## 2. Make it true for this app

Read the app before you write about it: its routes, its screens, its `src/` layout, `package.json`, `app.json`.

1. **Bundle ID.** In `.eas/workflows/pr.yml`, set `MAESTRO_APP_ID` to the app's iOS bundle identifier. If it is still a placeholder such as `com.yourcompany.yourapp`, ask the person for the real one.
2. **AGENTS.md.**
   - "What this project is": draft two or three sentences from the code, show them, and let the person correct them. Remove the EDIT comment.
   - "Stack" and "Folder layout": describe what the project has, not what the template had. Remove any library or folder that is not there. Remove the EDIT comment.
   - "Conventions" and "Test IDs": keep the rules that fit. Where the app has no shared button, strings file or theme file, drop the rule or ask whether to add one.
   - "Rules and what enforces them": every row must name a check that exists in this project, or say "Nothing yet". Do not leave a row that points at a check you did not install.
3. **App facts.** Fill in `.eas/agents/app-facts.md` from the running app or the code: the first screen and how to get past it, the screens and their root testIDs, timings, and what looks like a bug but is correct. Mark anything you could not confirm.
4. **Risk and fix-scope paths.** `scripts/factory/risk.mjs` and `scripts/factory/fix-scope.mjs` name paths such as `src/lib/purchases` and `src/lib/strings.ts`. Change them to this app's equivalents, and run their tests.

## 3. Wire it in

- **package.json scripts.** Add these, and ask before replacing a script of the same name:
  - `"typecheck": "tsc --noEmit"` (TypeScript projects)
  - `"check:testids": "node scripts/factory/check-testids.mjs"`
  - `"test:factory": "node --test \"scripts/factory/*.test.mjs\""`
  - `"verify"`: the project's typecheck, `expo lint`, `check:testids`, and its Jest run with `--ci`, chained with `&&`.
- **.gitignore.** Add `agent-output/`, `.argent/` and `*.profraw`.
- **ESLint.** Add a block with `linterOptions: { noInlineConfig: true }`, so no comment can switch a rule off. `scripts/factory/check-guardrails.mjs` already fails an agent pull request that edits an ESLint config.
- **Jest.** If the setup files mock modules such as AsyncStorage, recommend `clearMocks: true`, so a stub in one test cannot leak into the next.
- **Maestro.** The factory needs at least one flow in `.maestro/` that launches the app and asserts the first screen's root testID. If there is none, write it, and add the testID to the screen if it is missing.

## 4. Optional: the style rules

`conventions/eslint.config.reference.js` holds lint rules that enforce three AGENTS.md rules: no inline colours or size numbers, no hard-coded copy, and wrapped libraries imported only from `src/lib`. They assume a theme file, a strings file and a `src/lib` folder.

Ask whether to install them. If yes: add the rules to the project's ESLint config with this app's paths, copy `conventions/lint-rules.test.mjs` into `scripts/factory/` and change its probe paths to match, and put files that already break the rules on the exception list, so the list only shrinks. Then point the matching rows of the AGENTS.md table at ESLint.

## 5. Check

Run `npm run test:factory`, then `npm run verify`. Fix what the factory files cause. Report, and do not fix, failures that were there before.

## 6. Report

Tell the person, short:

- what was copied, merged or skipped, and each clash and how it was settled;
- what you wrote into AGENTS.md and the app facts that they should check;
- whether the style rules were installed;
- the check results;
- what the local runner needs on this Mac: Xcode with an iOS simulator, the Maestro CLI, and the argent MCP tools for QA (`npx @swmansion/argent@latest init`);
- for the cloud pipeline: a paid Expo plan with hosted simulators and Maestro jobs, then the one-time steps in the sstack README.

Then stop. The person commits.
