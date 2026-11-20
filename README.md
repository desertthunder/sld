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
