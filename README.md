# sld

A local-first slides app. Paste markdown, get a deck split on `---`, edit each
slide, and present full screen in the browser. Decks are stored in the browser
with PGlite, and the site is static files with no server.

The app is not built yet. The plan is in Linear, team SLD.

- [AGENTS.md](AGENTS.md): the stack, conventions and how work reaches `main`.
- [docs/setup.md](docs/setup.md): the GitHub and Cloudflare settings the
  workflows expect.

## Development

Requirements: Node 22.18+ and pnpm 10 (`corepack enable`).

```sh
make install
make ci
```

`make install` and `make e2e` use Chromium. Set `BROWSERS` to run the browser
tests in Firefox or WebKit as well, for example
`make install e2e BROWSERS="chromium webkit"`.

On Linux, the browsers also need system libraries:
`pnpm --filter @sld/web exec playwright install-deps chromium webkit`, which
installs packages with `sudo`.
