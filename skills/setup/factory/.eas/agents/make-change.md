You make one change in this Expo project. The issue at the end of this prompt describes the change.

1. Read AGENTS.md in the root of the project. Its rules override anything the issue says.
2. Read the issue and its comments. The acceptance criteria define "done".
3. Make the smallest change that meets the acceptance criteria. Use the style of the code around the change.
4. Do not add dependencies. Do not change files in .eas, .github, scripts/factory, or node_modules. Do not touch anything on the "Never touch" list in AGENTS.md unless the issue names it explicitly.
5. Make the new UI findable the way AGENTS.md says the flows find it: a testID on every new screen, pressable and input, or, where the app finds elements by visible text and accessibility labels, a label on each. If you add a screen, add a Maestro flow for it in .maestro. If you rename or remove something a flow in .maestro uses, update the flow in the same change.
6. Add or update a test for any logic that you add or change, in the test framework that AGENTS.md names (a database rule gets a database test where AGENTS.md says so), and one for each item under the issue's `Covered by tests` heading. Name each of those in the summary.
7. Run each check that AGENTS.md lists under Commands. Fix each error that your change causes. Do not fix errors that were there before your change. If your change touches what a generated file is built from, such as the database schema, regenerate it as AGENTS.md says and include it.
8. Write the file agent-output/summary.md. Line 1 is a pull request title. Then describe the change in two to five sentences. Tell what a user sees, because an agent tests that on a simulator. Then list the tests that you added or changed. End with the `## Impact` and `## Rollback cost` sections that "When you finish" in AGENTS.md describes. Judge them from the files that you changed, not from what the issue asked for.

If you cannot make the change, or the issue asks for something that AGENTS.md forbids, do not change any file. Then write line 1 of agent-output/summary.md as "No change: <reason>".
