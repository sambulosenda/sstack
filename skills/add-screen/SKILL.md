---
name: add-screen
description: Add a new screen to this Expo Router app the way this repo expects - route file, feature folder, testIDs, Jest test and Maestro flow. Use whenever a task adds a screen, tab or modal.
---

# Add a screen

Copy the shape of `src/features/settings/`. It is the reference.

## Steps

1. Pick a kebab-case name, for example `streak-history`.
2. Add the copy to `src/lib/strings.ts` under a key with that name.
3. Create `src/features/<name>/<name>-screen.tsx`.
   - Root view: `<ThemedView testID="<name>-screen">`, with a `SafeAreaView` inside.
   - Buttons: `AppButton` with `testID="<name>-<element>"`.
   - Other pressables and inputs: a `testID`, an `accessibilityRole` and a label.
   - Colours, spacing and sizes from `src/constants/theme.ts`.
   - Call `trackScreen('<name>')` once in an effect, after adding the name to `AnalyticsScreen` in `src/lib/analytics/events.ts`.
4. Put any logic (a reducer, a hook, formatting) in its own file in the feature folder, with a `*.test.ts` next to it.
5. Wire it in:
   - A tab: add `src/app/<name>.tsx` that only renders the screen, then add a trigger with a `testID="tab-<name>"` to both `src/components/app-tabs.tsx` and `src/components/app-tabs.web.tsx`.
   - A sheet over an existing screen: render it in a `Modal` from that screen, the way `settings-screen.tsx` renders the paywall.
6. Add `src/features/<name>/<name>-screen.test.tsx`: `await render(...)`, assert the root `testID`, and exercise one interaction with `await fireEvent.press(...)`.
7. Add `.maestro/<name>.yaml`:

   ```yaml
   appId: ${MAESTRO_APP_ID}
   name: <Name> - opens
   tags:
     - <name>
   ---
   - launchApp:
       clearState: true
   - runFlow: subflows/complete-onboarding.yaml
   # get to the screen here, by testID or by visible text
   - assertVisible:
       id: "<name>-screen"
   - takeScreenshot: <name>
   ```

8. Say in your summary how to reach the screen from a fresh install, so a person can add that line to `.eas/agents/app-facts.md`. Do not edit `.eas/` yourself.
9. Run `npm run verify`.

## Do not

- Do not import RevenueCat, PostHog or AsyncStorage in the screen. Use `src/lib`.
- Do not add a navigation library or a UI kit.
- Do not reuse another screen's `testID` prefix.
