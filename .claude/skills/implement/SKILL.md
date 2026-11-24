---
name: implement
description: Take a Linear issue (or an open draft pull request) to a reviewed pull request that is ready for Owais, by orchestrating subagents in order - the implementer, a standard review-and-revise pass, an adversarial review-and-revise pass that small issues skip, and a verifier that runs the change for real. Use for /implement, or when asked to implement an issue end to end.
argument-hint: <SLD-n | pr-number>
---

# Implement

Orchestrate one issue from Linear to a pull request ready for Owais's review.
This session dispatches, checks and reports; the work happens in fresh
subagents, one after the other. Never write the change or review a diff in this
session's own context: the separation is what makes the review worth having.

An `SLD-n` argument starts at **I**. A pull request number starts at **II**, for a
draft opened another way.

Each pass is a fresh agent: one that inherits this session's history, or the
implementer's, is not a fresh reader. If a pass hits a stop condition, report it
and stop; don't dispatch more agents to work around it.

## Before dispatching

1. Read the issue and its comments (`get_issue` with relations, `list_comments`).
   Stop and ask Owais if a blocked-by issue isn't Done, or if the acceptance
   criteria need a decision the issue doesn't record. For an `SLD-n` argument,
   also stop and ask if the issue isn't in **Todo** or its **Open questions**
   don't read "None." An issue with no Open questions section counts as
   "None."
2. Move the issue to **In Progress**.
3. Copy out what every subagent needs, since they may not have the Linear
   tools: the issue id and title, its Why, Scope, Acceptance criteria and Out of
   scope, and any Agent notes.
4. Decide whether the issue is small: it changes only docs, interface copy, CSS
   or config, and touches none of `.github/workflows`,
   `apps/web/static/_headers` or the CSS for the stage's scaling, overflow or
   fit. When unsure, it isn't small. A small issue skips **III**; every issue
   gets **IV**.

## I. Implementer

Dispatch the `implementer` agent with the issue text, the branch name
(`claude/sld-<n>-<topic>`, new from `main`) and the checkout. It implements,
runs `make ci`, commits with the first commit written as the pull request, and
pushes. The Branch PR workflow opens the pull request as a draft.

When it returns, confirm the branch head with `git ls-remote` and find the
draft (`list_pull_requests` with `head`), polling, since Branch PR opens it in
a run that starts after the push. If the implementer stopped without pushing,
report why and stop. If no draft appears within ten minutes, read the newest
Branch push and Branch PR runs for the branch, tell Owais what they show (a run
that failed, is still queued or never started) and stop; `docs/setup.md` has
his recovery steps.

## II. Standard review and revise

Subscribe to the pull request's activity (`subscribe_pr_activity`), so Owais's
reviews reach this session; a pull request number argument starts here. Pin the
head SHA and make a detached worktree at it, with dependencies installed
when the change needs them to build:

```sh
git worktree add --detach ../<repo>-review-std <sha>
```

Dispatch the `reviewer` agent with the pull request number, the SHA, the
worktree, the checkout on the branch and the issue text. It reviews at the
pinned SHA, posts its report through the bot, revises the findings above `nit`
in the checkout, pushes, and posts its answers. Remove the worktree when it
returns and confirm its push.

## III. Adversarial review and revise

Skip this pass for a small issue and go to **IV**.

Pin the new head, make a fresh worktree (`../<repo>-review-adv`), and dispatch
the `adversarial-reviewer` agent with the same inputs plus pass II's report and
answers. It checks that pass II's fixes hold, hunts the worst cases, posts, revises,
pushes and posts its answers. Remove the worktree when it returns and confirm
its push.

## IV. Verify

Tests prove the logic; this step shows the change working in the running
system. Pin the final head, make a fresh worktree (`../<repo>-verify`) with
dependencies installed, and dispatch the `verifier` agent with the pull request
number, the SHA, the worktree and the issue text.

It applies wherever there is something to run: UI changes get screenshots of
the app at phone and desktop widths, rendering changes get a sample deck's
slides shown beside the same slides on `main`, and docs or workflow changes get the
rendered result or a dry run. For a pure refactor, or docs with nothing to
render, it says so in one line and the step ends.

It publishes one Verification artifact for the pull request: the steps with
screenshots, a table of acceptance criteria (passed or failed, how checked,
where to see it), the commands to repeat it, and what it couldn't check and
why. It then comments on the issue with the verdict, criteria passed out of
checked and the artifact link, files learnings for later issues as Linear
comments, and returns a Verdict, the artifact URL, the comment id, the criteria
table, what it couldn't check and the learnings filed. A `not applicable` or
`blocked` verdict posts no comment, except that a `blocked` verdict on a
second verifier pass updates the earlier one. Remove the worktree when it
returns.

A failed criterion is a finding with no review comment id. Dispatch the
`reviser` agent with it, the checkout on the branch and the issue text, confirm
its push, and run IV again on the new head, passing the verifier the artifact
URL and the comment id so it updates both. If the fix needs a decision the
issue doesn't record, or the same criterion fails twice, stop. A `blocked`
verdict, where the verifier couldn't run the change at all, also stops the run:
report what blocked it.

## Finish

- It still merges: `mergeable_state` is `clean`, `blocked`, `draft` or
  `unstable`. Read it again while GitHub answers `unknown`. On a conflict, merge
  `main` into the branch (never rebase), resolve, run `make ci`, push, and ask
  whether to run the last review pass again.
- Attach the Verification artifact to the issue (`save_issue` with `links`,
  titled after the artifact), and check that the verifier's comment on the
  issue shows the head IV last verified and its verdict. When the verifier
  returned `Comment: none` with its text, post that text with `save_comment`
  (updating any earlier verification comment); without the Linear tools, give
  the text and the artifact link in the report to Owais instead. Neither
  applies when verification didn't.
- The description still says what the branch does, in one paragraph of at most
  four sentences and under 100 words before `Fixes SLD-n`. If it doesn't, say
  so in the report to Owais; don't edit it in this session.

Then post with `ready` set to `true` and a body whose first line is
`Review loop finished at <full head sha>`, followed by one line per pass: what
it found and what it fixed, or for III on a small issue, that it was skipped.
The verify line links the Verification artifact and names any criterion that
failed and the commit that fixed it, which no review pass read, or says in a few
words why verification didn't apply. The bot marks the pull request ready,
which requests Owais's review, then comments. Move the issue to **In Review**.

CI skips drafts, so marking the pull request ready starts its first `ci` job.
Every draft push already left a `ci` check run on the head that completed as
`skipped`, which GitHub counts as passing, so it proves nothing. Wait for the
`ci` check run that started after the ready mark: read `pull_request_read`
method `get_check_runs`, compare each `ci` run's `started_at` with the time of
the mark, and poll until that run completes (foreground `sleep` is blocked).
Only its `success` is green. If no such run starts within ten minutes, stop and
report it. A run that hasn't completed thirty minutes after its `started_at`,
such as a job still queued for a runner, counts as a failure outside the code.
If it fails, read the failing step's log. A failure outside the code
(billing, a GitHub outage, a runner that never started or a job cancelled
before its steps ran) is not the reviser's: stop and tell Owais which run
failed, the likely cause and what to re-run, and leave the re-run to him. For
a failure the code causes, dispatch the `reviser` agent with it as a finding
with no review comment id, the checkout on the branch and the issue text,
confirm its push, and wait for `ci` on the new head; every push to a ready pull
request starts one. If the fix is outside the issue, or `ci` fails twice for
the same cause, stop and report it. Report to Owais only once `ci` is green.

Report the pull request link, the head, the check state, what each pass found,
any commit pushed after the loop-finished comment's head (no review pass read
it), the Verification artifact link, and anything left for Owais to judge. For a
change with something to look at (a component, a screen), start it
(`make dev`), report the port with `report_preview_port`,
and say so. Never approve, merge or turn on auto-merge.

## Owais's reviews

When Owais requests changes, this session revises; no workflow does. Read his
review comments and their ids (as the `revise` skill says), dispatch the `reviser`
agent with them, the checkout on the branch and the issue text, confirm its
push, and post its answers with `answers` set to `true`. Then wait for `ci` on
the new head as **Finish** says, including its rule for a failure outside the
code; a `ci` event from the subscription never licenses a re-run. A plain
comment gets a reply through the bot only when it asks something. Don't run II
or III again unless he asks; the pull request stays ready.

When no session is subscribed (the one that opened the pull request has ended),
nothing revises on its own. Owais asks a session to pick it up; it subscribes
to the pull request (`subscribe_pr_activity`) and follows this section.

## Posting

Everything on the pull request goes out as desertthunder-bot through the Bot
comment workflow, never through a session's own GitHub access, which posts as
Owais. GitHub MCP `actions_run_trigger`, method `run_workflow`, workflow
`comment.yml`, ref `main`, inputs:

| Post            | Inputs                                 |
| --------------- | -------------------------------------- |
| A review report | `pr`, `body`, `review` = full head SHA |
| Revise answers  | `pr`, `body`, `answers` = `true`       |
| Loop finished   | `pr`, `body`, `ready` = `true`         |

The workflow runs as it is on `main`, so a pull request that changes
`comment.yml`'s inputs can't use them before it merges; give Owais that post's
text in the session instead, and say so in the report.

The call returns once the run is queued, and the post usually lands within a
minute or two. Foreground `sleep` is blocked, so poll: read `pull_request_read`
(`get_reviews`, `get_review_comments` or `get_comments`) until it shows a bot
post created after the dispatch. If none appears after a few reads, look at the
newest `comment.yml` runs and report the failure: the run, the likely cause
and the post's text. A subagent returns it to the session, which reports it to
Owais. Never dispatch the same post twice, and never re-run the failed run.

## Stop conditions

Any of these ends the run without marking the pull request ready, or, when
`ci` fails after it is ready, leaves it ready with the failure reported. Report
why.

- A fix needs a decision the issue doesn't record.
- The same finding survives two revises without its cause changing.
- `make ci` fails and the fix is outside the issue.
- A verified criterion still fails after one revise.
- The verifier returns `blocked`.
- `ci` on the ready pull request fails twice for the same cause, its fix is
  outside the issue, or no `ci` run starts within ten minutes of the ready mark.
- A bot post fails. Report the run, its likely cause and the post's text.
- A GitHub Actions run fails for a reason outside the code. Report which run,
  the likely cause and what to re-run; Owais re-runs it. Never re-run, cancel or
  retrigger a run, or delete or push a branch again only to retrigger one.
