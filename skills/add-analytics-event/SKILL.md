---
name: add-analytics-event
description: Add or change a PostHog analytics event in this app. Use whenever a task says to track, log, measure or instrument something a user does.
---

# Add an analytics event

Events are typed. `track` only accepts names in the `AnalyticsEvent` union, so a typo fails the typecheck.

## Steps

1. Name the event `object_verb` in snake_case, past tense: `streak_viewed`, `reminder_enabled`. Check the union first. If an existing event already means the same thing, use it.
2. Add it to `AnalyticsEvent` in `src/lib/analytics/events.ts`. Give it `properties` only if a question will be asked of them. Property names are camelCase.
3. Call `track({ name: '...', properties: { ... } })` at the moment the thing happens: in the press handler or after the awaited call resolves. Not in render, and not in an effect that can re-run.
4. Never put personal data in properties: no names, emails, free text the user typed, or precise location.
5. If the event is fired from logic that has a test, assert on it. `jest/setup.js` mocks PostHog. See `src/lib/analytics/analytics.test.ts` for how to reach the mock.
6. Run `npm run verify`.

## Do not

- Do not import `posthog-react-native` outside `src/lib/analytics`.
- Do not rename or remove an existing event unless the issue says so. Dashboards depend on the names.
