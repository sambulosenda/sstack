---
name: fix-maestro-flow
description: Diagnose and fix a failing Maestro end-to-end flow in .maestro. Use when a flow fails in PR checks, when check-testids reports a missing testID, or when a change moves or renames UI that a flow touches.
---

# Fix a failing Maestro flow

A failing flow means one of two things. Find out which before you edit anything.

## 1. Decide: is the app wrong, or is the flow out of date?

- Read the failure. It names the flow and the step, for example `id: paywall-restore is visible`.
- Find that element in `src/`. Search for the testID or the visible text.
- **The element is gone or renamed and the issue did not ask for that.** The app is wrong. Restore the testID or the element. Do not touch the flow.
- **The element moved, was renamed or was removed because the issue asked for it.** The flow is out of date. Update the flow in the same pull request.
- **The element is there but the flow never reaches it.** Something earlier changed: a new screen in the path, a renamed tab, an extra onboarding step. Fix the navigation steps in the flow, or the subflow in `.maestro/subflows/`.

## 2. Fix

- Prefer `id:` selectors. Use visible text only for native elements that do not expose a testID, such as tab bar items.
- Wait for screens with `extendedWaitUntil` and a timeout. Never add fixed sleeps.
- Keep `clearState: true` on `launchApp`, so each flow starts from a fresh install.
- Never delete an assertion to make a flow pass. If a step checks behaviour the issue removed, replace it with a check of the new behaviour.
- A flow must never start a purchase, sign out, or delete data.

## 3. Check

1. `node scripts/factory/check-testids.mjs` must pass.
2. If Maestro is installed locally: `MAESTRO_APP_ID=<bundle id> maestro test .maestro/<flow>.yaml`.
3. Run `npm run verify`.
