# sstack

A software factory for Expo apps, as a Claude Code plugin. Agents turn issues into tested changes. Scripts block bad changes, agents give advice, and a person makes every call that matters: what to build, what to merge, and what to release.

```
issue ──► triage: ready to build? ──► coding agent ──► guardrails · typecheck · lint · tests
              │ no: questions for you                        ▼
              │                                      Maestro flows on a simulator build
              │                                              ▼
              │                       QA agent on a simulator  +  fresh code reviewer
              │                           (advice, never blocks)        │
              ▼                                                         ▼
       you answer, it goes again                        you merge, then approve the release
```

Run it two ways:

- **Locally, free.** The `factory-run` skill runs every station on your Mac, one issue at a time, and stops at a branch for you to review.
- **In the cloud.** EAS workflows run the same stations on Expo's servers, started by a GitHub label. This needs a paid Expo plan (see [Cost](#cost)).

## Install

```sh
claude plugin marketplace add sambulosenda/sstack
claude plugin install sstack@sstack
```

Or inside Claude Code: `/plugin marketplace add sambulosenda/sstack`, then `/plugin install sstack@sstack`.

Then, in the root of your Expo app, run `/sstack:setup`. It copies the factory into the project and adapts it to your app, asking before it overwrites anything. Commit the result yourself.

## Skills

| Skill | What it does |
| --- | --- |
| `/sstack:setup` | Installs the factory: agent prompts, EAS workflows, guardrail scripts, QA and review briefs, and an `AGENTS.md`. Then makes each file true for your app. Run once per project. |
| `/sstack:prd-to-issues` | Breaks a product spec into small issues an agent can build one at a time, each with checkable acceptance criteria. |
| `/sstack:factory-run` | Runs one issue through every station on your Mac: triage, change, scripted checks, Release build, Maestro, then QA and review by fresh subagents. Re-checks any fix you ask for afterwards, as much as its size needs. |
| `/sstack:add-screen` | Adds a screen the way `AGENTS.md` describes: route, feature folder, testIDs, test and Maestro flow. |
| `/sstack:add-analytics-event` | Adds an analytics event through the app's wrapper. |
| `/sstack:fix-maestro-flow` | Diagnoses a failing Maestro flow and fixes the app or the flow, never by weakening the flow. |

`add-screen` and `add-analytics-event` assume the folder layout in `AGENTS.md`. `setup` adapts that file to your app.

## What the factory enforces

These are checks in code, not requests in a prompt.

| Rule | Enforced by |
| --- | --- |
| No deleted tests or flows, no fewer assertions, no skips, no `any`, `@ts-ignore` or lint escapes in an agent change | `check-guardrails.mjs` |
| No changes to the lint config, `.eas/`, `.github/` or `scripts/factory/` by an agent | `check-guardrails.mjs`, `make-change.sh`, `fix-change.sh` |
| Every testID a Maestro flow uses exists in the app | `check-testids.mjs` |
| A fix after QA and review gets a re-check sized to the fix | `fix-scope.mjs` |
| The push happens in a clean clone no agent touched, and agents never hold a token | `clones.sh` |
| Code from a pull request (package installs, lint, tests) runs only in a job with no secrets; jobs that hold tokens install nothing from it | `pr.yml` |
| Only pull requests from the repository itself run the pipeline, never a fork's | `pr.yml` |
| Claude Code starts from an empty npm prefix, so a package planted in `node_modules` cannot pose as it | `run-agent.sh` |
| At most 2 fix attempts per pull request, 10 agent pull requests a day | `pr.yml`, `issue-to-pr.yml` |

QA and review are advice. Their verdicts never fail a run until you choose to make QA blocking, after you have measured how often it is right.

Optional style rules (`setup` asks): no inline colours or size numbers, no hard-coded copy, and wrapped libraries imported only from `src/lib`.

## Requirements

- An Expo app in a git repository.
- For the local runner: a Mac with Xcode and an iOS simulator, the [Maestro CLI](https://maestro.dev), and the [argent](https://github.com/swmansion/argent) MCP tools, which the QA agent drives the simulator with (`npx @swmansion/argent@latest init`).
- For the cloud: a GitHub repository, an Expo account on a paid plan, and an Anthropic API key or Claude Code token.

## Cost

The local runner costs your model tokens and nothing else.

The cloud pipeline needs Expo's hosted simulators and Maestro jobs, which the free Expo plan does not include. Check yours with `eas simulator:availability --json`. Each pull request costs a build or a repack, a Maestro job, a simulator session of up to 30 minutes, and model tokens; each retry costs the same again.

## Cloud setup

Once per app, after `/sstack:setup`:

1. Set the app's name, slug, scheme and bundle identifier in `app.json`, and `MAESTRO_APP_ID` in `.eas/workflows/pr.yml`.
2. `eas login`, then `eas init`.
3. Connect the GitHub repository to the Expo project: https://docs.expo.dev/eas/workflows/get-started/#automate-workflows-with-github-events
4. Create a robot user with the Developer role in your Expo account, and two tokens for it.
5. In the Expo project's `preview` environment, add `EXPO_TOKEN_SIMULATOR` (robot token 1), `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`, `GITHUB_TOKEN` (fine-grained, this repo only: contents, issues and pull requests, read and write) and `GITHUB_REPOSITORY` (`owner/repo`). The agent can read every variable there, so keep nothing else in it. Keep the `development` environment free of secrets: the static checks run pull request code there.
6. On GitHub: `gh secret set EXPO_TOKEN` (robot token 2), and create the labels `agent`, `bug`, `needs-human`, `needs-spec`, `allow-test-changes`, `risk:low`, `risk:medium` and `risk:high`.
7. Validate: `for f in .eas/workflows/*.yml; do eas workflow:validate "$f"; done`

Turn it on in stages: a pull request by hand first, then one tiny labelled issue, then bigger ones, and releases last.

## What has been proven, and what has not

- Twelve issues of a real app went through the local runner end to end, and a thirteenth ended, correctly, in "no change" with the evidence written up. The fresh reviewer found real bugs that the author missed, and re-checking fixes found more.
- Each guardrail has a test that fails on the mistake it was written for.
- `setup` was run step by step on a fresh `create-expo-app` (SDK 58): the factory's 48 tests, Jest, and the testID check pass there. The fresh template itself fails one typecheck and one lint check in two web files; `setup` reports those rather than hiding them.
- The local build and QA stations of `factory-run` have run only on the app the factory grew up in, not yet on a fresh one.
- The cloud workflows validate against Expo's schema, and the job scripts were run against a local git remote and an agent that attacks them. They have **not yet run on Expo's servers**. Expect to fix a few things on the first real run, and please open an issue when you do.

## Known limits

- An agent runs as the same OS user as the job that holds the GitHub token. Tokens are removed from its environment and the push happens in a clean clone, but a prompt-injected agent could still read the token from its parent process or change files outside its folder. Limit the damage: a GitHub token for this one repository, an Expo robot user with the Developer role, and the daily cap on agent pull requests. The retry job is where this matters most: the fix agent runs the pull request's code there, beside the token. Running each agent in a job of its own, with no token, is the planned fix.
- The cloud pipeline has not yet run on Expo's servers. Treat it as experimental.
- A FAIL from the QA agent can be wrong. It usually lacked a fact: add it to `.eas/agents/app-facts.md`.
- The pipeline tests iOS. Android needs a second PR workflow.

## Credits

The EAS workflows follow Expo's agentic workflow guides (https://docs.expo.dev/agentic-workflows/). Some app scaffolding came from Expo's default template, which is MIT licensed; its notice is in `LICENSE-expo-template.txt`.

## Licence

MIT. See `LICENSE`.
