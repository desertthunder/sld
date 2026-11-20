---
name: review
description: Review a pull request for defects and report the findings, as a standard or an adversarial pass. Use for the review half of the reviewer and adversarial-reviewer passes in the implement skill, or when asked to review a diff before merge.
argument-hint: "<pr-number> [standard|adversarial]"
---

# Review

Review a diff and report findings. Don't edit code while reviewing; the
`revise` skill owns changes. In the `implement` skill, the `reviewer` and
`adversarial-reviewer` agents review with this skill, post the report through
the bot, then revise with the `revise` skill.

| Pass        | Brief                                                                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| Standard    | Correctness, edge cases, security, concurrency, performance, API compatibility, test coverage, readability. |
| Adversarial | Worst case only: security holes, races, unhandled input, violated invariants, tests that cannot fail.       |

The adversarial pass runs after the standard pass and its revise, and is handed
both. It reports again only what the code still gets wrong, then looks for what
the standard pass would miss. The `adversarial-reviewer` agent lists what it
hunts.

## Read the change, not the working tree

A branch moves while a review reads it, and the session's checkout may hold
another branch. Read the pinned commit the dispatching session gives you,
through git or a detached worktree it made for you:

```sh
git fetch origin <branch> main
git diff origin/main...<sha>
git show <sha>:<path>
git log --oneline origin/main..<sha>
```

Read the files around the diff, not only the diff. Write nothing inside the
repository; keep drafts and scratch tests in the session's scratch directory.
In a cloud session, read the pull request with the GitHub MCP tool
`pull_request_read` (methods `get`, `get_files`); load it with ToolSearch.

## Know the task

The pull request description ends with `Fixes SLD-n`. Read that Linear issue and
its acceptance criteria (`get_issue`, `list_comments`) when the Linear tools
are available; otherwise the dispatching session gives you the criteria, or the
description and the first commit are the task.

## Judge against something

A finding needs a source. Rank them:

1. The issue's acceptance criteria.
2. `AGENTS.md`, and the conventions the surrounding code already keeps.
3. Tests that exist, tests that should exist, and tests that cannot fail.
4. Behavior a user can observe.

Taste alone is a `nit` at most.

### Complexity

Ask of each change: is it harder than the problem it solves? Does it add a
layer or a configuration point one concrete helper would cover? Does it repeat
something the codebase already does under a new name? Report complexity like a
defect: what it costs and the concrete alternative.

### Prose

Documentation in the diff, the pull request title and description, and the
branch's commit messages are changes too. Judge them against the `writing`
skill and AGENTS.md's rules for PR descriptions (one paragraph of at most
four sentences and under 100 words before `Fixes SLD-n`).

| What you find                                    | Severity |
| ------------------------------------------------ | -------- |
| Documentation contradicts the code it describes  | `high`   |
| User-visible behavior changed, documents did not | `medium` |
| A writing-skill tell used throughout             | `medium` |
| PR description over AGENTS.md's limit            | `medium` |
| Heading case, term drift                         | `nit`    |

## Finding format

One line per finding:

```text
<severity> · <path>:<line> — <problem> → <why it matters> → <fix direction>
```

| Severity  | Means                                                                |
| --------- | -------------------------------------------------------------------- |
| `blocker` | Merging causes data loss, a crash, a security hole, or a regression. |
| `high`    | Wrong behavior in a case the change is supposed to handle.           |
| `medium`  | Wrong behavior in an unhandled case, or a missing test for one.      |
| `low`     | Works, but will cause a defect later.                                |
| `nit`     | Style or naming inside the repository's conventions.                 |

The path is from the repository root and the line is in the changed file at
the pinned commit, so the bot places the finding on that line of the diff. A
finding with no line, such as one about the description, names it in words.
State what breaks and with what input; a finding that can't is speculation.

## Keep the report readable

- First line: `<Standard|Adversarial> pass on #<n> at <short sha> · <model>`, using the model id the harness reports.
- Then findings, most severe first, no preamble or summary, under 200 words.
  Past ten, give the ten that matter and say how many you left out.
- Group repeats into one finding naming every site.
- Say `No findings` when there are none.

## Do not

- Edit files, commit, push, comment, approve or merge.
- Repeat a finding an earlier revise fixed, unless the fix didn't hold.
