# Repository setup

The GitHub and Cloudflare settings this repository expects. Owais makes them by hand in the GitHub UI; the sections below explain each one.

## Settings checklist

- Actions and pull requests (Settings → Actions → General → Workflow permissions): "Allow GitHub Actions to create and approve pull requests" can stay off, since desertthunder-bot opens every pull request.
- Squash merges only (Settings → General → Pull Requests): allow squash merging, turn off merge commits and rebase merging, and tick "Automatically delete head branches". See [step 2](#2-squash-merges-only).
- The `main` ruleset (Settings → Rules → Rulesets → New ruleset → New branch ruleset): name it `main`, set it Active and target the default branch. Require a pull request with one approval, a review from code owners and squash as the only merge method, require the status check `ci`, and block force pushes and deletions. See [step 3](#3-protect-main).
- The `bot` environment (Settings → Environments → New environment): name it `bot`, choose Selected branches and tags under Deployment branches and tags, and add only the branch rule `main`. Add the secrets `DESERTTHUNDERBOT_APP_ID` and `DESERTTHUNDERBOT_PRIVATE_KEY` to it, so only `main`'s workflows can read the App's key. See [step 1](#1-install-desertthunder-bot-and-keep-its-key-on-main).
- The `release tags` ruleset (Settings → Rules → Rulesets → New ruleset → New tag ruleset): name it `release tags`, set it Active and target `refs/tags/v*`. Restrict creations, updates and deletions, and add the desertthunder-bot App to the bypass list with Always allow. A `v*` tag runs that commit's `deploy.yml` in the `deploy` environment, so without this ruleset anyone who can push a tag could read the Cloudflare token. Create it before the `deploy` environment admits `v*` tags. See [Releases](#releases).
- The `deploy` environment (Settings → Environments → New environment): name it `deploy`, choose Selected branches and tags, and add only the branch rule `main` and the tag rule `v*`. Once Cloudflare is set up, add the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and optionally the variable `CLOUDFLARE_PROJECT_NAME`. See [Deploys](#deploys).
- The browser labels (Issues → Labels → New label): `firefox` with color `#E66000` and description "Also run the browser tests in Firefox", and `webkit` with color `#1D76DB` and description "Also run the browser tests in WebKit". Browsers (`browsers.yml`) runs the browser tests in each engine whose label a ready pull request carries.
- No repository secrets (Settings → Secrets and variables → Actions): none of the four secrets above belongs here, because a repository secret reaches any branch's workflow.

## How work reaches `main`

Agents push `claude/<topic>` branches. The push that creates a branch runs Branch push (`branch-push.yml`), which holds no secret, and when it finishes the Branch PR workflow (`branch-pr.yml`) runs from `main` and opens a draft pull request as `desertthunder-bot`, a GitHub App, so Owais is never the author and can approve it. Later pushes to the branch skip both, so neither is billed. CI runs on pushes to `main` and on pull requests once they are ready for review: agents run `make ci` before every push, so a draft starts no job, and marking it ready starts CI on its head. CI runs lint, check, the unit tests and the build in one job, the Chromium browser tests in three shards at once, a job each, and the devtools steps in another, each only when its paths changed; a last job named `ci`, the required check, passes only if every one of them passed or was skipped by the path filter. CI runs the browser tests in Chromium only and never runs on a label, because a label would start a skipped `ci`, which GitHub counts as passing. A `firefox` or `webkit` label instead starts Browsers (`browsers.yml`), whose `browsers` check runs the tests in the labeled engines, and a push, marking the draft ready or any other label runs it again while one of those labels is present. Any other label runs the engines again rather than skip, because a skipped run would replace a failed `browsers` check on the same head. Browsers runs only when a pull request changes the web app or the files CI treats as shared. Both workflows cache Playwright's browsers by runner image, Playwright version and browser set, so a run with the same version and browsers restores them and installs only their system packages. A pull request reads its own caches and `main`'s, and only CI runs on `main`, so Chromium's cache carries across pull requests while Firefox and WebKit download once per pull request and browser set, so adding the second label downloads both again. Sessions never comment with their own access, which would post as Owais: they dispatch the Bot comment workflow (`comment.yml`), which posts review reports, answers and the loop-finished summary as the bot and marks the draft ready. Owais squash-merges by hand and removes the agents' trailers, so nothing on `main` carries AI attribution.

The App's key lives in a `bot` environment that only `main` may use. A push-triggered or dispatched workflow runs the YAML on the branch it ran for, so a repository secret would reach anyone who can push a branch, an agent session included. Only jobs that run `main`'s copy of a workflow, Branch PR, Release and Bot comment dispatched on `main`, can read the key.

This is Reseed's setup, copied with its poster in `tools/devtools`.

### When Branch PR fails

Owais runs these steps; a session reports the failed run to him and never re-runs it or deletes and pushes the branch again (see `AGENTS.md`). Branch PR runs only after a branch's first push, so if that run failed (a missing secret, a GitHub outage), later pushes don't open the pull request. Fix the cause on `main`, then re-run the Branch push run for that first push: Actions → Branch push → the run for the branch → Re-run all jobs, or `gh run rerun <run id>` with the id from `gh run list --workflow branch-push.yml --branch <branch>`. Its completion starts Branch PR again from `main`, which opens the draft as `desertthunder-bot` with the branch's first commit as its title and description. If the branch's first push had no commits ahead of `main`, a re-run finds none either: delete the remote branch (`git push origin --delete <branch>`) and push it again, and that push counts as its first. Don't open it with `gh pr create` under your own account: you would be its author, and an author can't give the approval `main` requires.

## 1. Install desertthunder-bot and keep its key on `main`

The App already exists for Field Atlas and Reseed. On its settings page (Developer settings → GitHub Apps → desertthunder-bot):

1. Check its repository permissions: Contents read and write, Pull requests read and write. Metadata read comes with every App. Contents write is for `comment.yml`, since GitHub refuses an App token's GraphQL calls that mark a draft ready and resolve a review thread without it, and for `release.yml`, which pushes the release branch, tags the release and publishes it. Branch PR still asks for Contents read.
2. Install it on this repository (Install App → the account → Only select repositories → `sld`).
3. Create an environment named `bot` (Settings → Environments → New environment). Under Deployment branches and tags choose Selected branches and tags and add the branch rule `main`, so no job on another branch or tag can use it.
4. Add two secrets to the `bot` environment, not the repository: `DESERTTHUNDERBOT_APP_ID`, the App ID from its settings page, and `DESERTTHUNDERBOT_PRIVATE_KEY`, a private key generated there, as the whole `.pem` file. If either is a repository secret (Settings → Secrets and variables → Actions), delete it there.

Without them Branch PR, Bot comment and Release fail at the `create-github-app-token` step. Actions no longer needs permission to create pull requests: if "Allow GitHub Actions to create and approve pull requests" is ticked under Settings → Actions → General, it can be turned off.

## 2. Squash merges only

Settings → General → Pull Requests: allow squash merging, turn off merge commits and rebase merging, and delete head branches after merge.

## 3. Protect `main`

One ruleset on the default branch (Settings → Rules → Rulesets):

- require a pull request, with one approval and a review from code owners;
- require the status check `ci`. Leave `browsers` out: a pull request without a `firefox` or `webkit` label skips it, and a pull request that changes no web file never starts it, so as a required check it would pass without running or block a pull request forever;
- allow squash merges only;
- block force pushes and deletion.

## 4. Check the loop end to end

GitHub runs a `workflow_run` workflow such as Branch PR only from the default branch, and the `bot` environment admits only `main`, so neither path can be tried from a branch: run this check after the change that sets them up is on `main`.

1. Push a branch named `claude/setup-check` with one small commit.
2. Branch push should run, then Branch PR should run on `main` and open a draft pull request authored by `desertthunder-bot`, titled with the commit subject.
3. The `ci` check should be skipped on the draft. Push a second commit: Branch push should conclude `skipped` and Branch PR should not open a second pull request or run its job.
4. Dispatch the Bot comment workflow from `main` (Actions → Bot comment → Run workflow) with the pull request's number and a body, once with `review` set to the head SHA and a line such as `low · <changed file>:1 — check`, then with `answers` set to `true` and a body `<comment id> · Fixed in <sha>.`, where the id ends the review comment's link (`#discussion_r<id>`), then with `ready` set to `true`. The review should land on the diff as the bot, the reply should land in its thread and resolve it, and the pull request should turn ready with the bot's comment and start CI, ending in its `ci` job. Dispatched on any other ref, the workflow should fail before its job starts, because the `bot` environment refuses it.
5. Close the pull request and delete the branch.

## Releases

release-please works the version out from the commit subjects on `main`. [AGENTS.md](../AGENTS.md#commits-and-pull-requests) says what a version number means.

1. When Owais wants a release, he runs Release (`release.yml`) by hand from `main` (Actions → Release → Run workflow). It runs in the `bot` environment, as desertthunder-bot. release-please reads the commits since the last release and opens a pull request titled `chore: release <version>` that bumps `version` in `package.json` and `.release-please-manifest.json` and adds the release's notes to `CHANGELOG.md`. If that pull request is already open, the run refreshes it with the commits merged since. Merging other PRs leaves it alone, so `ci` doesn't run on it after every merge. A run by hand creates no release, and a run from any branch but `main` fails before it touches anything. Only `feat`, `fix` and `perf` commits and `!` commits appear in the notes, under Features, Bug Fixes and Performance (and breaking changes); `chore`, `ci`, `test`, `build`, `docs` and `refactor` stay out. Nobody edits `CHANGELOG.md` by hand.
2. The bot opens the release PR, so Owais can approve it, and `ci` runs on it like any other. He squash-merges it when it's ready, running Release by hand again first if PRs have merged since. The release PR carries no AI attribution.
3. Every push to `main` runs Release, which does nothing unless the push merges the release PR. That merge's run tags the merge commit `vX.Y.Z` and publishes a GitHub Release with the same notes.
4. The tag push starts Deploy (`deploy.yml`), and that run on the tag is what publishes the release. A tag the workflow's own token made would start no workflow, which is why Release runs as the bot. Release itself builds and deploys nothing.

The first release is 0.1.0. `.release-please-manifest.json` starts at `0.0.0`, which release-please treats as no release yet, and `release-please-config.json` sets `initial-version` to `0.1.0`, the version it proposes when there is no release. Once 0.1.0 is out the manifest holds `0.1.0` and `initial-version` no longer applies. While the version is `0.x`, `bump-minor-pre-major` makes a `!` commit bump the minor number and `bump-patch-for-minor-pre-major` makes a `feat` bump the patch number.

Only desertthunder-bot may create, move or delete a `v*` tag. A tag push runs the `deploy.yml` on the tagged commit, and the `deploy` environment admits `v*` tags, so anyone else who could push a tag, an agent session included, could tag a commit whose edited `deploy.yml` reads the Cloudflare token. So the repository has an active tag ruleset named `release tags` (Settings → Rules → Rulesets → New ruleset → New tag ruleset): target `refs/tags/v*`, restrict creations, updates and deletions, and the desertthunder-bot App in the bypass list with Always allow. Create it before the `deploy` environment admits `v*` tags, so the tags are never admitted without it. To delete a bad tag, turn the ruleset off, delete the tag, and turn the ruleset back on straight away: while it is off, anyone who can push can reach the Cloudflare token. The bypass trusts the App, not this repository's copy of its key: Field Atlas and Reseed hold keys to the same App, and anyone who can use any of its keys can push a branch, tag it `v*` and run that branch's own `deploy.yml`, since the check that a tag is on `main` lives in that file. So the Cloudflare token is as safe as the least-guarded copy of the App's key, the `bot` environments of Field Atlas and Reseed included.

The `release tags` ruleset and the `deploy` environment's `v*` tag rule must exist before the first release. Without that, the `v0.1.0` tag's Deploy fails before its upload job starts. When a tag's Deploy fails, Owais re-runs it from its run page (Re-run all jobs), or redeploys by running Deploy by hand from `main` once the cause is fixed. A session reports the failure to him rather than re-running it.

Check it after a change to `release.yml`: run Release by hand from `main`, and it should open or refresh a release PR by `desertthunder-bot`, or open nothing when only `ci`, `chore` and `docs` commits have merged since the last release, because those release nothing. Merge an ordinary PR, and Release should run on the push without updating the release PR. Merge the release PR, and Release should tag `vX.Y.Z`, publish a GitHub Release, and start Deploy on the tag.

## Deploys

Deploys are optional: nothing publishes until Cloudflare is set up. After that, every release tag deploys, and running Deploy by hand from `main` (Actions → Deploy → Run workflow) redeploys the newest release: it finds the newest `vX.Y.Z` tag on `main` and runs Deploy again on that tag, so nothing but a release is ever published. Before the first release a run by hand fails, saying there is nothing to redeploy. Deploy (`deploy.yml`) builds `apps/web` and uploads `apps/web/build` to a Cloudflare Pages project with Wrangler. The project is named by the `deploy` environment variable `CLOUDFLARE_PROJECT_NAME`, or `sld` when it is unset; if the account has no project of that name, Deploy creates it with the production branch `main` before the first upload.

The build prerenders the landing page as `index.html` and writes the app shell, which renders on the client only, as `app.html`. Pages serves `app.html` at `/app`, and `apps/web/static/_redirects` rewrites every path under `/app` to `/app` with status 200, so a deck URL opens directly. The rewrite names `/app`, not `/app.html`, because Pages answers `/app.html` with a redirect to `/app` that drops the deck path. The build has no `404.html`. `apps/web/static/_headers` sends `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` on every path, the landing page and unknown paths included. The markdown parser's WebAssembly build uses shared memory, which browsers allow only on a cross-origin isolated page. `make dev` and `pnpm --filter @sld/web preview` send the same two headers on every response, deep paths included, because `vite preview` doesn't read `_headers`.

Safari doesn't support `credentialless`, so the headers alone leave it without isolation. For a page under `/app` that loads without isolation, the app registers `static/isolation-worker.js`, a service worker scoped to `/` that re-serves same-origin responses with `Cross-Origin-Embedder-Policy: require-corp`, and reloads the page once when the worker takes control. If the page still isn't isolated, the app says so instead of reloading again. The landing page doesn't run this check, since it opens no database. The trade-off: under `require-corp`, Safari blocks an image from another origin unless that origin sends CORS or `Cross-Origin-Resource-Policy` headers, while Chrome and Firefox load it without credentials.

Before uploading, Deploy fails when the build lacks `app.html` or its `_redirects` line, has a `404.html`, or when `_headers` is missing either header.

The upload job always runs for a tag, in a `deploy` environment that only `main` and `v*` tags may use, for the same reason as `bot`: a repository secret would reach any branch's workflow. Before it, a job with no secret refuses a tag that isn't `vX.Y.Z` or whose commit isn't on `main`, and a run by hand from any branch but `main`. Releases and redeploys queue separately, so a redeploy never cancels a waiting release, and an upload is skipped when a newer release has been tagged since its run started.

1. Create a Cloudflare API token (My Profile → API Tokens → Create Token → Create Custom Token) with one permission, Account → Cloudflare Pages → Edit, and under Account Resources include only the account the site should live in. Give it no zone permissions. That permission covers listing, creating and deploying to Pages projects.
2. Copy the account ID from the account's home page (the Account ID field, or the URL after `dash.cloudflare.com/`).
3. Create an environment named `deploy` in GitHub (Settings → Environments → New environment). Under Deployment branches and tags choose Selected branches and tags, and add the branch rule `main` and the tag rule `v*`. Create it with those rules before adding any secret to it.
4. Add two secrets to the `deploy` environment, not the repository: `CLOUDFLARE_API_TOKEN`, the token from item 1, and `CLOUDFLARE_ACCOUNT_ID`, the ID from item 2.
5. Optionally, add the variable `CLOUDFLARE_PROJECT_NAME` to the `deploy` environment to deploy to a project other than `sld`. The name must be 1 to 58 lowercase letters, digits and hyphens, starting and ending with a letter or digit, or Deploy fails at the upload job's second step. A project that already exists keeps its own production branch; Deploy always uploads with `--branch main`, so check it is `main` under the project's Settings, or the upload is a preview.

Check it once the first release is out: run Deploy from `main` (Actions → Deploy → Run workflow). Its summary names the newest release tag, and a second Deploy run starts on that tag. Without both secrets that run fails at the upload job's first step and names the missing one. On the first run the log says it is creating the project; later runs say the project exists. The log ends with the deployment's `pages.dev` URL. A project's `pages.dev` address is its name, or its name with a suffix when the plain name is taken. Open the production URL: the app should load, and `crossOriginIsolated` should be `true` in the browser console. A deep path such as `/deck/check` should load the app shell with a 200. A run of Deploy by hand on any other branch fails at its first job and starts nothing. A release tag's own run deploys the same way, and its log names the tag.

## Later

- Tangled mirror: Not set up. Add the knot as a second remote, or a workflow that pushes `main` to it.
- Production domain: Not chosen. Add it as a custom domain on the `sld` Pages project (Custom domains).
- Preview deploys: Pull requests get none.
- Team key: The docs and agent files assume the Linear team key is `SLD`. If the team gets another key, replace it: `grep -rl 'SLD' AGENTS.md README.md docs .claude | xargs sed -i 's/SLD/<KEY>/g'`.
