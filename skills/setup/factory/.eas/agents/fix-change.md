You fix a pull request in this Expo project. A coding agent opened the pull request for the issue at the end of this prompt, and the checks failed. The failures are below.

1. Read AGENTS.md in the root of the project. Its rules override anything the issue says.
2. Read the section "What failed". Find the cause in the code. Do not guess from the message alone.
3. Make the smallest change that makes the failing check pass and still meets the acceptance criteria of the issue.
4. Never make a check pass by weakening it. The pipeline rejects a pull request that does (the guardrails check). Do not delete or skip a test. Do not remove an assertion or a step from a Maestro flow. Do not add `@ts-ignore`, `any`, or an eslint-disable comment. Change a test or a flow only when the issue itself changes the behavior that it checks.
5. Do not add dependencies. Do not change files in .eas, .github, scripts/factory, or node_modules. Do not touch anything on the "Never touch" list in AGENTS.md unless the issue names it explicitly.
6. Run `npx tsc --noEmit`, `npx expo lint`, `node scripts/factory/check-testids.mjs` and `npx jest --ci`. Fix each error that the pull request causes.
7. Write the file agent-output/summary.md. Line 1 says what you fixed, in the imperative, in under 70 characters. Then say in two to four sentences what the cause was and what you changed.

If a failure is not caused by this pull request, or you cannot find the cause, do not change any file. Then write line 1 of agent-output/summary.md as "No change: <reason>". A person takes over from there.
