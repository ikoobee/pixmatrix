# Contributing to pixmatrix

Thanks for your interest in improving pixmatrix!

## Getting started

Requirements: Node 18+ (for tests only — the site itself has zero dependencies).

```bash
git clone https://github.com/ikoobee/pixmatrix.git
cd pixmatrix
npx --yes serve .      # local preview, any static server works
npm test               # regression tests must pass before every commit
```

## Ground rules

- **Keep it zero-build.** The site runs as plain static files with native
  ES Modules — no bundler. Runtime libraries are only allowed as lazy CDN
  imports at feature-use time (see JSZip). Shared math stays in
  `js/engine.js` / `js/exif.js` as pure functions, Node-testable.
- **Byte-level changes need tests.** Anything touching the EXIF module or
  the engine math must come with cases in `tools/`.
- **New tools** get their own directory (`<tool>/index.html` +
  `js/<tool>.js`), a landing page with TDK/FAQ/JSON-LD, a card on the home
  page, a sitemap entry, and a nav update (see `tools/renovate-nav.mjs`).
- **UI language:** the interface is Chinese-only by design (see README);
  code, comments, commits, issues and PRs are English.
- **No quotas.** Don't add usage limits or account gates.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).

## Pull requests

1. Fork / branch from `main`.
2. Make your change; `npm test` green.
3. Open a PR against `main` describing what changed and why.

## License

By contributing, you agree that your contributions will be licensed under the
MIT License that covers this project — **inbound = outbound**.
