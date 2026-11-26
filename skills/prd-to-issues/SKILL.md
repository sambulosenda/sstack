---
name: prd-to-issues
description: Break a product requirements document into small GitHub issues that the coding agent can build one at a time. Use when asked to plan work from a PRD, spec or feature brief, or to create agent-ready issues.
---

# Turn a PRD into agent-ready issues

This is the input station of the factory. Vague or oversized issues are the main cause of bad pull requests, so most of the quality is decided here. A person runs this skill interactively and approves the result. Nothing is filed without their say-so.

## 1. Read

- Read the PRD (default `docs/PRD.md`) and `AGENTS.md`.
- Read the code the feature touches. Issues must name real files and real testIDs.
- If the PRD leaves a decision open that changes what gets built, ask the person now. Do not guess and do not write an issue around a guess.

## 2. Slice

One issue is one pull request. Each issue must pass every test below, or be split:

- **One behaviour.** A user can see or do one new thing when it merges.
- **Small.** Roughly one screen or one piece of logic. If the description needs "and also", split it.
- **Checkable in the running app.** Every acceptance criterion can be confirmed by tapping through the app on a simulator with a fresh install. A behaviour that cannot be shown that way (a saved value the app cannot create, a new calendar day, what a screen reader says) goes under `### Covered by tests`, never under acceptance criteria. Two issues were marked FAIL by QA because a criterion broke this rule.
- **Self-contained.** Builds on `main` as it will be when the issue starts. If it needs another issue first, say so on the first line: `Depends on #<n>`.
- **Inside the lines.** It does not need anything on the "Never touch" list in `AGENTS.md`. If it does, it is not an agent issue. Mark it `human` and explain.

Order the issues so that each one leaves the app working. Thin vertical slices first: a screen with fake data, then the real data, then the edge cases.

Things to keep for a person, not the agent: new dependencies, native configuration, purchase and entitlement logic, authentication, data deletion, anything that needs a secret or a dashboard.

## 3. Write

Write each issue to `docs/issues/<nn>-<slug>.md` in this shape, which matches `.github/ISSUE_TEMPLATE/agent-task.yml`:

```md
# <Imperative title, under 70 characters>

Depends on: <nothing | #n>
For: <agent | human>

### What should change
<One change. Name the screen and where on it.>

### Acceptance criteria
- <What a user sees or can do. One checkable line each.>

### Covered by tests
- <Behaviour a test proves but the running app cannot show. Leave the heading out when there is none.>

### Out of scope
- <What must be left alone.>

### Pointers
- <Real file paths, components, testIDs, the skill to use.>
```

Write for a reader with no context. The agent sees only the issue and the repo.

## 4. Review with the person

Show the list: number, title, `agent` or `human`, dependencies. Say which PRD requirements are not covered by any issue, and why. Ask for changes. Do not continue until they approve.

## 5. File

Only after approval, and only the ones they approved:

```sh
gh issue create --title "<title>" --body-file docs/issues/<nn>-<slug>.md
```

Do not add the `agent` label. The person adds it, one issue at a time, after reading each issue. Tell them to start with the first issue that has no dependencies and to wait for it to merge before labelling the ones that depend on it.
