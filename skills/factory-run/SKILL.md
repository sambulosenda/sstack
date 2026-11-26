---
name: factory-run
description: Run one issue through the factory on this machine instead of on Expo's servers - triage, change, checks, simulator build, Maestro, QA - and stop at a local branch for review. Use when asked to build, run or try an issue locally, or to run the factory without the cloud.
---

# Run one issue through the factory, locally

The same stations as the cloud pipeline, with the same prompts and scripts, run by you on this Mac. One issue at a time: the simulator is shared.

The input is an issue file, `docs/issues/<nn>-<slug>.md`, in the shape that `prd-to-issues` writes. The output is a branch `agent/issue-<nn>` with one commit, and a report. You do not merge, push or open a pull request.

Work through the stations in order. Do not skip one because the change looks small.

## 0. Preflight

- `scripts/factory/local-build-test.sh` exists. If not, the factory is not installed in this project: run the `setup` skill first.
- `git status --porcelain` is empty and the branch is `main`. If not, stop and say what is in the way.
- `node_modules` exists. If not, `npm ci`.
- Read the issue file. If `For:` says `human`, stop: it is not an agent issue.

## 1. Triage

Read `.eas/agents/triage.md` and apply it to the issue. You are in a conversation, so instead of writing a verdict file:

- BUILD: say so in one line and go on.
- ASK: put the questions to the person in chat, with your recommended answer for each, and wait. Then add the answers to the issue file under `### Decisions` and commit that to `main` with the message `Record decisions for issue <nn>`, so the issue stays the source of truth.

## 2. Change

1. `git switch -c agent/issue-<nn>`. If the branch exists, stop and ask whether to delete it.
2. Follow `.eas/agents/make-change.md` from step 1 to step 8, with the issue file as the issue. Its rules hold here too: nothing in `.eas`, `.github` or `scripts/factory`, no new dependency, nothing on the "Never touch" list.
3. The summary goes to `agent-output/summary.md` (ignored by git).

If the outcome is "No change", switch back to `main`, delete the branch, and report the reason. That is a good result.

## 3. Scripted checks

Run each. All must pass.

```sh
node scripts/factory/check-guardrails.mjs --local main
npm run verify
git status --porcelain -- .eas .github scripts/factory   # must print nothing
```

## 4. Build and end-to-end flows

Pick the simulator: one that is already booted, otherwise boot one. Note its UDID. Then, in the background, because the first build takes several minutes:

```sh
bash scripts/factory/local-build-test.sh <UDID>
```

It builds a Release app, which carries its own JavaScript and needs no Metro, installs it, and runs every flow in `.maestro/`. It handles what used to need a hand fix: it sets the locale CocoaPods needs, restores `package.json` after the build rewrites it, keeps the issue's own change to that file, records the app's path for QA, and runs the flows once more only if Maestro itself crashed without failing a flow. Exit 1 is a native build failure, which is not yours to fix: stop and report it. Exit 2 is a failed flow: go to station 5.

## 5. Retry

When station 3 or 4 fails because of your change, follow `.eas/agents/fix-change.md`: find the cause, make the smallest fix, never weaken a check. Then run stations 3 and 4 again. Two fix attempts at most. After the second, stop and report what still fails.

## 6. QA and 7. Review

Get both ready with one command:

```sh
bash scripts/factory/local-prepare-checks.sh <issue file> <UDID>
```

It reinstalls the app so QA starts on onboarding like a new user, clears old evidence, writes the review folder `agent-output/review/`, and writes two briefs: `agent-output/qa-brief.md` and `agent-output/review-brief.md`. They come from the templates in `scripts/factory/briefs/`. When something a tester needed was missing, fix the template, not the brief, so the next run has it too.

Record what the project looks like now, so you can tell afterwards whether a checker changed it:

```sh
git status --porcelain --untracked-files=all | grep -v ' agent-output/' > /tmp/before-checks.txt
```

Then start two fresh subagents in parallel, neither of which has seen your work. Use the plugin's own agents, whose tools are limited to what each station needs:

- **QA**, agent type `sstack:qa`: the text of `agent-output/qa-brief.md`, as it is. Add a short "Notes for this issue" section only for what is specific to this issue, such as a system setting it needs or how long a session takes to end. It writes `agent-output/evidence/verdict.md`.
- **Review**, agent type `sstack:reviewer`: the text of `agent-output/review-brief.md`, as it is. It has no shell and cannot run commands. It writes `agent-output/review/review.md`.

When both are done, check that neither changed the project:

```sh
git status --porcelain --untracked-files=all | grep -v ' agent-output/' | diff /tmp/before-checks.txt -
```

Any output means a checker touched a file outside `agent-output/`. Undo that change, say so in the report, and treat that checker's verdict as void.

Both verdicts are advice: report them as they are, do not retry on them, and do not edit them. Do not fix review findings on your own: the person decides. If the sstack agents are not available, use general-purpose subagents with the same briefs, and say so in the report. If you cannot start a subagent at all, do the station yourself and say in the report that the checker was also the author.

## 7b. Re-check a fix

When the person asks you to fix findings after QA and review, the fix is new code that no checker has seen. Commit the change as it was first, make the fix, then run:

```sh
node scripts/factory/fix-scope.mjs <commit QA and review saw>
```

It prints the smallest re-check the fix needs. You may do more, never less.

- **none**: only wording, docs or comments changed. Run station 3.
- **single**: run stations 3 and 4, then one fresh `sstack:reviewer`, with the same before-and-after `git status` check: `bash scripts/factory/local-prepare-checks.sh <issue file> <UDID> <commit QA and review saw>` writes a review brief for the fix alone. Describe in `agent-output/summary.md` which findings the fix addresses before you run it.
- **full**: run stations 3, 4, 6 and 7 again.

Report what the re-check found. A fix that skips its re-check is code that nobody checked.

## 8. Finish

1. Commit everything on the branch in one commit. The message is line 1 of the summary, then the rest of the summary. If there were fix attempts, they are part of the same commit.
2. Stay on the branch, so the person can run the app as it is.
3. Report, short:
   - the title and the branch,
   - risk: the output of `node scripts/factory/risk.mjs $(git diff --name-only main)`,
   - each station: passed, failed, or not run, and why,
   - the QA verdict line and where the screenshots are,
   - the review verdict line and each "must fix" finding,
   - for each fix after QA and review, the level fix-scope printed and what the re-check found,
   - fix attempts used,
   - how to accept it (`git switch main && git merge agent/issue-<nn>`) or drop it (`git switch main && git branch -D agent/issue-<nn>`).

## When the run teaches you something

If a station failed, or a checker needed something it did not have, propose the fix in the report: a check, a line in `AGENTS.md`, a fact in `.eas/agents/app-facts.md`, or a line in a template. Prefer the check, as the table in `AGENTS.md` says. Do not add any of it yourself.
