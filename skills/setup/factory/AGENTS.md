# AGENTS.md

Rules for any coding agent working in this repository. Read this file before you change anything.

## What this project is

<!-- EDIT: two or three sentences. What the app does, who uses it, what "working" means. -->
An Expo / React Native app for iOS and Android, built by a pipeline in which agents write most changes and people review them.

## Expo has changed. Do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt, an index of all Expo docs. Follow its links to the page you need. Never answer from memory.

## Stack

<!-- EDIT: keep this list true. Agents trust it. The lines below are an example app's: replace them with this app's stack. -->
- Expo with Continuous Native Generation. The `ios/` and `android/` folders are generated and not committed. Never create or edit them. Configure native behaviour in `app.json` and config plugins.
- TypeScript, strict mode. React Compiler is on.
- Expo Router. Routes live in `src/app/`.
- RevenueCat (`react-native-purchases`) for subscriptions, wrapped in `src/lib/purchases`.
- PostHog (`posthog-react-native`) for analytics, wrapped in `src/lib/analytics`.
- AsyncStorage for small persisted values, wrapped in `src/lib/storage`.
- Jest with `jest-expo` and `@testing-library/react-native` (version 14: `render` and `fireEvent` are async, so `await` them).
- Maestro for end-to-end flows, in `.maestro/`.

## Folder layout

<!-- EDIT: describe this app's folders. The block below is an example layout. -->
```
src/app/              routes only. A route file renders one screen component and nothing else.
src/features/<name>/  screens, hooks, logic and tests for one feature.
src/components/       shared, dumb UI components (AppButton, ThemedText, ThemedView).
src/constants/theme.ts colours, spacing and size tokens.
src/lib/              wrappers: analytics, purchases, storage, strings.
.maestro/             end-to-end flows. Subflows in .maestro/subflows/.
scripts/factory/      pipeline scripts and their tests. Off limits. See "Never touch".
.eas/, .github/       workflows and agent scripts. Off limits. See "Never touch".
```

File names are kebab-case: `settings-screen.tsx`, `use-onboarding.ts`. Import with the `@/` alias, which points at `src/`.

## Commands

Run these before you say a task is done. All four must pass. `npm run verify` runs them in order.

```sh
npx tsc --noEmit
npx expo lint
node scripts/factory/check-testids.mjs
npx jest --ci
```

Install packages with `npx expo install <package>`, never `npm install <package>`, so versions match the SDK.

## Conventions

<!-- EDIT: the rules about theme tokens, a strings file, a shared button and src/lib wrappers assume an app built that way. Drop or adapt the ones this app does not have. -->
- One change per pull request. Make the smallest change that satisfies the issue.
- Function components and hooks only.
- No `any`. No `@ts-ignore`. No eslint-disable comments. If a type is hard, fix the type.
- No inline colours, font sizes or spacing numbers. Use the tokens in `src/constants/theme.ts`. Add a token if you need a new value.
- All user-facing copy lives in `src/lib/strings.ts`. No hard-coded strings in components.
- Use `AppButton` for buttons. It carries the role, the label, the touch target and the testID.
- Never import `react-native-purchases`, `posthog-react-native` or AsyncStorage outside `src/lib`. Screens call the wrappers.
- A new analytics event is added to the `AnalyticsEvent` union in `src/lib/analytics/events.ts` first.
- A new persisted key is added to `StorageKeys` in `src/lib/storage.ts` first.
- Logic lives outside the screen file (a reducer, a hook, a plain function) with a test next to it: `thing.ts` and `thing.test.ts`.
- Prefer libraries already in `package.json`. Do not add a dependency unless the issue says so.

## Test IDs (the end-to-end tests depend on these)

- The root view of every screen has `testID="<name>-screen"`: `home-screen`, `settings-screen`, `paywall-screen`.
- Every pressable and input has a `testID` in kebab-case, prefixed by its screen: `settings-upgrade`, `onboarding-next`.
- Write a testID that a Maestro flow uses as a plain string literal, so `check-testids` can find it.
- Never rename or remove a `testID` without updating `.maestro/` in the same pull request. `node scripts/factory/check-testids.mjs` fails if you forget.
- A new screen needs a Maestro flow in `.maestro/` that opens it and asserts its root `testID`.

## Accessibility

- Every pressable has `accessibilityRole` and a label (visible text or `accessibilityLabel`).
- Touch targets are at least `MinTouchTarget` (44 points).
- Text must survive the largest Dynamic Type setting without clipping. Do not set fixed heights on text containers.

## Never touch

- `.eas/`, `.github/` and `scripts/factory/`. The pipeline refuses agent pull requests that change them.
- `eas.json`, and the identifiers in `app.json` (bundle identifier, package, project ID, scheme, slug).
- Purchase logic, the `PRO_ENTITLEMENT` name, product IDs and prices, unless the issue names them explicitly.
- Authentication, account deletion and any code that deletes user data, unless the issue names them explicitly.
- Secrets. Do not print, log or commit a key or token. Do not read `.env*` files.
- Tests and Maestro flows, to make a failing check pass. Fix the code. Change a test only when the issue changes the behaviour it checks. The pipeline enforces this: `scripts/factory/check-guardrails.mjs` fails a pull request that deletes a test or a flow, removes more tests or assertions than it adds, or adds a skip, `any`, `@ts-ignore` or `eslint-disable`.

If an issue asks for something on this list and does not name it explicitly, make no change and say why.

## Rules and what enforces them

A rule that nothing checks is a request. When a mistake happens twice, fix it at the highest level that works: make it impossible in the code's structure, then in types, then with a lint or check whose error names the fix, then with a test. Prove the new check fails on the real past mistake. Write a rule here last, and only for a judgment call. When a rule below says "nothing" and its mistake happens again, that is a repeat: enforce it in the same change.

| Rule | Enforced by |
| --- | --- |
| No `any`, `@ts-ignore`, `eslint-disable` or skipped tests | `scripts/factory/check-guardrails.mjs` |
| Do not delete tests or flows, or remove more tests or assertions than you add | `scripts/factory/check-guardrails.mjs` |
| Do not change `.eas/`, `.github/` or `scripts/factory/` | `make-change.sh` and `fix-change.sh` refuse the pull request |
| Every testID a Maestro flow uses exists in `src/` as a literal | `scripts/factory/check-testids.mjs`, which ignores comments |
| A behaviour the running app cannot show goes under `Covered by tests`, not under acceptance criteria | Triage asks to move it; QA leaves it out of its verdict |
| A fix made after QA and review gets at least the re-check its size and kind need | `scripts/factory/fix-scope.mjs` in the local runner; in the cloud every push runs every check again |
| Every pressable has a role and a label, with a touch target of 44 points | `AppButton`, for buttons only |
| No inline colours, font sizes or spacing numbers | Nothing yet. The review agent looks for it. The optional sstack style rules enforce it with ESLint |
| All user-facing copy lives in `src/lib/strings.ts` | Nothing yet. The review agent looks for it. The optional sstack style rules enforce it with ESLint |
| Never import `react-native-purchases`, `posthog-react-native` or AsyncStorage outside `src/lib` | Nothing yet. The review agent looks for it. The optional sstack style rules enforce it with ESLint |
| Do not change, rename or add an ESLint config | `scripts/factory/check-guardrails.mjs` |
| No comment can switch a lint rule off | `linterOptions: { noInlineConfig: true }` in the ESLint config |
| Logic lives outside the screen file, with a test next to it | Nothing yet. A judgment call; the review agent looks for it |

## When you finish

Write a summary a reviewer can check against the app:

1. Line 1: a pull request title in the imperative ("Add reset button to counter").
2. What a user now sees or can do, in two to five sentences. An agent tests exactly what you write here on a simulator.
3. Which tests you added or changed.
4. Two sections that tell the reviewer how closely to look. Each starts with `**Verdict:** Low`, `Medium` or `High`, then one or two sentences that name the files or data behind the verdict. When two levels fit, pick the higher.

   `## Impact`: how much of the app the change can break.
   <!-- EDIT: name this app's paths in the three levels below. -->
   - Low: files in one `src/features/<name>/` folder only.
   - Medium: shared code that several screens use: `src/components/`, `src/constants/theme.ts`, `src/lib/strings.ts`, or routes in `src/app/`.
   - High: `src/lib/purchases`, `src/lib/analytics`, `src/lib/storage.ts`, `app.json`, `package.json`, or anything on the "Never touch" list.

   `## Rollback cost`: what it takes to undo the change after release.
   - Low: JavaScript only, and no persisted data changes. Reverting the commit restores the old behaviour.
   - Medium: adds a new persisted key or a new analytics event. A revert leaves unused data behind, and nothing breaks.
   - High: changes the meaning or the shape of a value that is already persisted, or changes native configuration or dependencies, which needs a new store build.

## When you are stuck

Stop and say so. A clear "No change: <reason>" is a good outcome. A guess that compiles is not.
