# sld: agent guide

sld is a local-first slides app. Someone pastes markdown, gets a deck split on `---`, edits each slide's markdown, and presents full screen in the browser. Decks live in a Postgres database inside the browser (PGlite), and the site is static files with no server.

Read this file before starting work. Read the Linear issue before starting it.

## Layout

| Path                     | What                                                                                                                                                                                                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`               | SvelteKit web app (TypeScript), built as static files with no server.                                                                                                                                                                                                                              |
| `tools/devtools`         | Repository tools in TypeScript that Node runs with no build step, such as the poster behind `comment.yml` (`node tools/devtools/src/devtools.ts pr`).                                                                                                                                              |
| `docs/`                  | [repository setup](docs/setup.md). The design record, `docs/design.md`, arrives with the first design issue.                                                                                                                                                                                       |
| `.github/workflows`      | `ci.yml` (checks), `branch-push.yml` and `branch-pr.yml` (a draft PR for each agent branch), `comment.yml` (posts as desertthunder-bot), `release.yml` (release-please), `deploy.yml` (publishes each version tag to Cloudflare Pages, and redeploys the newest by hand). No workflow runs Claude. |
| `.claude/skills/writing` | Prose style for docs, PR text and Linear issues. Use it when writing any of those.                                                                                                                                                                                                                 |
| `.claude/agents`         | Subagents for `/implement`: `implementer`, `reviewer`, `adversarial-reviewer`, `verifier`, and `reviser` for Owais's reviews and a failed `ci`. Skills in `.claude/skills`.                                                                                                                        |

## The stack and its rules

These choices are made. Changing one is a decision for Owais, recorded in Linear.

- SvelteKit with `adapter-static`. The app under `/app` renders on the client only, and `/` is prerendered at build time. There is no server, so nothing may need one.
- PGlite holds the data. It runs in a Web Worker, stores to IndexedDB, and is shared between tabs through PGlite's multi-tab worker.
- Drizzle defines the schema. Its own migrator needs Node, so migrations are bundled at build time and applied in the browser at startup. Never change a migration that has shipped: add a new one.
- Migrations only add tables, or columns with defaults, because a tab running an older build can keep using a newer database. A rename, a drop or a required column needs a plan across two releases.
- Sätteri parses markdown through its WebAssembly build, which uses shared memory. The site must stay cross-origin isolated: `apps/web/static/_headers` sends `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`, and Deploy refuses a build without them.
- One row per slide. A slide's markdown is the only source for its content. A deck's full markdown exists only as import and export.
- Colors come from Base16 schemes (tinted-theming) as the CSS variables `--base00` to `--base0F`. Slide and editor styles read those variables and hard-code no color.
- Slides draw on a stage of fixed logical size (1920 by 1080 for 16:9) that scales to fit. Slide CSS uses the stage's pixels, never viewport units.

A person's decks exist only in their browser. A change that could lose or corrupt stored decks, such as a migration or a change to how markdown is split, needs a test that proves existing data survives it.

## Decisions

Decisions live in Linear. State a decision in the issue it belongs to, as a dated `**Decision (YYYY-MM-DD):**` line at the top of the description, above **Why**. When it needs more context or spans several issues, also write a `Decision: <topic>` doc on team SLD and link it from that line. A decision that changes how the product looks also updates `docs/design.md` in the same PR.

## Commands

Requirements: Node 22.18+ (see `.nvmrc`) and pnpm 10 (`corepack enable`).

Run `make help` for every target. The ones you will use most: `make dev` (the web app on :5173) and `make ci` (everything CI runs: run it before pushing).

Checks for what you touched, if you don't run `make ci`:

- Web: `pnpm --filter @sld/web check && pnpm --filter @sld/web test`, plus `pnpm exec eslint apps/web`
- Devtools: `pnpm --filter @sld/devtools check && pnpm --filter @sld/devtools test`, plus `pnpm exec eslint tools/devtools`

## Conventions

- TypeScript: strict mode, ES modules, Prettier (tabs, single quotes, width 120) and ESLint with `eslint-plugin-unicorn` configured at the repo root. Tests sit next to the code as `*.test.ts` or `*.spec.ts` and run with Vitest.
- TypeScript object shapes use `type`; `interface` is only for classes to implement, and for declaration merging that needs one, such as SvelteKit's `App` types in `apps/web/src/app.d.ts`.
- The web app imports its own modules as `#lib/<name>.ts`.
- No barrel files (an `index.ts` that only re-exports). Import from the module that defines the thing. SvelteKit's `src/lib/index.ts` stays as generated.
- No task identifiers (`SLD-n`) in code or code comments. They belong in commits, PRs and Linear.
- Mark deferred work in code with a `TODO:` comment that says what's left, never a task id or prose like "comes later".
- Keep inline comments to a minimum. Comment only what the code can't say, such as a non-obvious reason or constraint, never what it does.
- No editor-specific files (`.vscode/`, `.idea/`). Shared settings go in `.editorconfig`, Prettier and ESLint.
- The app renders on the client only: the `/app` layout sets `ssr = false`; `/` is prerendered.
- Add a dependency only when the issue needs it. Say why in a short clause of the PR description.
- Interface copy says _deck_, _slide_, _scheme_ and _present_. It never says _presentation file_, _theme_ for a color scheme, or _render_.
- Write American English in identifiers, comments, tests, strings, interface copy, docs, agent files and PR text: _color_, _center_, _gray_, _normalize_, _behavior_.
- Never commit credentials. When a task needs a secret or a DNS record, give Owais the exact secret name or record and let him add it. Don't ask for the value.
- No license is chosen yet: there is no license file, and every package stays `"private": true, "license": "UNLICENSED"` until Owais picks one.

## Commits and pull requests

- Never commit to `main`. Work on a `claude/<topic>` (or `codex/<topic>`) branch and push it. Name the branch after the issue, `claude/sld-<n>-<topic>`, for example `claude/sld-9-split-markdown`, so Linear links it. Each issue gets a new branch from `main`: never reuse a merged PR's branch, even when the session was started on one.
- Commit subjects and PR titles follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary (SLD-n)`. The PR title becomes the squash commit on `main`. The release PR is the one exception (see below).
  - Types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`.
  - Scopes, optional: `web`, `infra`. Leave the scope out when a change spans several.
  - Mark a breaking change with `!` after the type or scope. A change that makes an existing deck unreadable, or draw differently without the person changing it, is breaking: `feat(web)!: split slides on headings (SLD-40)`.
  - Start the summary with a lowercase imperative verb, and end it without a period.
- The version follows from the commits. The version stays `0.x` until Owais calls it 1.0, and until then a `!` commit bumps the minor number and a `feat`, `fix` or `perf` commit bumps the patch number.
- release-please (`release.yml`) keeps one release PR open on `main`, opened by desertthunder-bot. When Owais merges it, the bot tags `vX.Y.Z` and publishes a GitHub Release, and Deploy publishes the tag. Its title, `chore: release <version>`, carries no `(SLD-n)` and must not be changed: release-please reads the version from it, and with any other title it tags nothing and opens no further release PR. release-please owns `CHANGELOG.md`: never edit it by hand. Its Features, Bug Fixes and Performance sections come from `feat`, `fix` and `perf` commit subjects; other types stay out of it.
- The Branch PR workflow opens the pull request as a draft, as `desertthunder-bot`, so Owais can approve it. The first commit on the branch becomes the PR: its subject is the title and its body is the description, minus trailers. So:
  - make the first commit subject the PR title you want, and
  - write the first commit body as the PR description, which Owais uses as the squash commit body.
- A PR description is one paragraph of prose, at most four sentences and under 100 words before `Fixes SLD-n`. Say what the change does and anything the reviewer must decide. Leave out how it was checked, a list of commits, tours of files or packages, and explanations of build warnings; those belong in the review reports or the code. Name files, commands and values in backticks. Follow the writing skill. End with `Fixes SLD-n` for each issue it closes.
- After the PR is open, the workflow leaves its title and description alone. When later commits change what the PR does, edit the description on the PR (GitHub MCP `update_pull_request`). The body is the description only: add nothing after `Fixes SLD-n`.
- Commits on those branches are authored by the agent and may carry its attribution trailers.
- Work an issue with `/implement SLD-n` (the `implement` skill). The session orchestrates four fresh subagents in turn: the `implementer` writes the change and pushes, the `reviewer` reviews then revises, the `adversarial-reviewer` reviews adversarially then revises, and the `verifier` runs the final head the way a person would, publishes a Verification artifact and comments on the issue with its verdict and link. The reviewers post their reports and answers as the bot. A PR stays a draft until all four are done; then the session marks it ready with `comment.yml`'s `ready=true`, linking the artifact, waits for `ci` on that head, and fixes it if it fails before reporting to Owais. The orchestrating session never writes or reviews the change itself.
- `CODEOWNERS` requests Owais's review on every PR once it's ready. Only Owais merges. Never merge a PR or turn on auto-merge, from a session or a workflow. He squash-merges by hand, removing the agent trailers and adding his own, so nothing on `main` carries AI attribution. Don't add attribution to anything that lands on `main` directly, such as release tags.
- When Owais requests changes, the session subscribed to the PR revises: it dispatches the `reviser` subagent with his comments and their ids, confirms the push, and posts the answers with `comment.yml`'s `answers=true`, so the bot replies in each thread and resolves the fixed ones. If no session is subscribed, Owais asks one to pick the PR up. No GitHub Action runs Claude.
- Sessions never comment on GitHub with their own access: that posts as Owais. Dispatch the Bot comment workflow instead, so the comment comes from desertthunder-bot: GitHub MCP `actions_run_trigger` with method `run_workflow`, workflow `comment.yml`, ref `main`, and inputs `pr` and `body` (or `gh workflow run comment.yml -f pr=<n> -f body=...`). Add `review=<full head sha>` to post a review report (lines like `high · path:line — finding` land on the diff), `answers=true` to post `<comment id> · <outcome>` lines as thread replies, or `ready=true` to mark the draft ready for review and post the body as a comment. Post only what the `implement` skill's **Posting** section lists. If you can't dispatch it, tell Owais in the session instead of commenting. Never approve a review.
- The `ci` check must pass. Run `make ci` before pushing: CI skips draft PRs and runs once a PR is ready, so on a draft your `make ci` is the only check.
- Sessions never re-run, cancel or retrigger a GitHub Actions run, and never delete or push a branch again only to retrigger a workflow. When a job fails for a reason the code can't fix, such as billing, a GitHub outage or a runner that never started, tell Owais which run failed, the likely cause and what to re-run, and he re-runs it. A failure the code causes still gets fixed and pushed. Dispatching `comment.yml` is a post, not a re-run.
- There is no `PLAN.md`. Linear holds the plan.

## Cloud sessions

Cloud sessions run in a container with a fixed disk allowance. Before you finish a task, stop the dev servers you started and delete scratch files and clones you won't reuse.

## Tasks

Work is tracked in Linear, team **SLD**. It is a sub-team of **DT** (Desert Thunder). Use the Linear MCP connector.

| Concept      | Linear                  |
| ------------ | ----------------------- |
| Collection   | Project                 |
| Run unit     | Issue, one pull request |
| Task         | Issue                   |
| Dependency   | Blocked-by relation     |
| Idea or spec | Project document        |

Each feature is a project, and a project carries the label of the version it belongs to: `v1` (paste, edit, present), `v2` (positioning through `:::` directives) or `v3` (video export and audio). Issues carry the same label. Several workspace projects share names such as Foundation, so pass a project's ID to the connector, not its name.

Working an issue:

1. Read the issue and its comments (`get_issue`, `list_comments`). Read the project's description and documents.
2. Move it to **In Progress** when you start.
3. Open the PR by pushing the branch. Move the issue to **In Review** if Linear hasn't already.
4. The issue moves to **Done** when the PR merges. If acceptance criteria are left over, say so in an issue comment instead of closing it.

Creating issues:

- Check for duplicates with `list_issues` first.
- Assign it to the driver when you create it. For now the driver is Owais.
- Set team `SLD`, the project and the version label. Add blocked-by relations when they're known.
- One issue is one pull request. Add sub-issues only for pieces that must land in the same pull request. Projects group related issues: a big area gets its own project, not a parent issue with many sub-issues.
- Sibling sub-issues block one another in the order to work them. A sub-issue is never blocked by its parent.
- A design issue (the artboards for a look) stands on its own. Never make it a sibling sub-issue of the issue that builds the look; it blocks the issues that build it.
- Structure: a dated **Decision** line first when the issue records one (see [Decisions](#decisions)), then **Why**, **Scope**, **Acceptance criteria**, **Out of scope**, then a collapsible **Agent notes** section for implementation detail.
- Product requirements stay in Linear. Development docs go in `docs/`.

## Design work

- Make designs as Claude artifacts. Attach the artifact link to the Linear issue (`save_issue` with `links`) with a title that says what it shows.
- A look is chosen on artboards before it is built. The design issue blocks the issues that build the look.
- When a design changes a token or a rule, update `docs/design.md` in the same PR.
