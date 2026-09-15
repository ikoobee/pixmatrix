# pixmatrix

**English** | [简体中文](README.zh-CN.md)

A toolbox of eight focused image utilities sharing one static site — nine-grid slicing, compression, format conversion, exact resizing, EXIF inspection, long-image stitching, screenshot beautifying and batch renaming. Every tool runs 100% in your browser; nothing is uploaded, no account, no limits.

[![CI](https://github.com/ikoobee/pixmatrix/actions/workflows/ci.yml/badge.svg)](https://github.com/ikoobee/pixmatrix/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](CHANGELOG.md)

![pixmatrix](assets/og-cover.png)

## The eight tools

| Tool | Path | What it does |
|---|---|---|
| **Nine-grid slice** | [/grid/](grid/) | Cover-crop to square, optional watermark pass, 3×3 tiles (1080/750/600 tiers), moments-style preview, ZIP with ordered names |
| **Compress** | [/compress/](compress/) | Quality (50–95) + long-side cap as dual levers; PNG strategy (photo-like → JPEG with white pad / truly lossless → side downscale only); live ratio table with "grew larger" warnings |
| **Convert** | [/convert/](convert/) | JPG / PNG / WebP interconversion with quality control; transparent → JPG auto white pad; batch of 20; AVIF/HEIC honestly out of scope (browser encode limits) |
| **Resize** | [/resize/](resize/) | Exact-pixel output with three fit modes: cover crop / contain letterbox / blurred background; presets plus custom W×H; multi-size preview + ZIP |
| **EXIF view & strip** | [/exif/](exif/) | Lightweight TIFF parsing (IFD0 + SubIFD: camera, aperture, shutter, ISO, GPS detection); byte-level outputs (GPS-only / full EXIF removal), zero quality loss |
| **Stitch** | [/stitch/](stitch/) | Vertical/horizontal long-image stitching with gap/margin/corner-radius/alignment; 32M-pixel area cap for legitimate long images |
| **Beautify** | [/beautify/](beautify/) | Screenshot polish: 4 gradient presets, rounded corners, shadow, padding, macOS window bar |
| **Batch rename** | [/rename/](rename/) | Template-based renaming with old/new mapping; File System Access writes renamed copies to a `renamed/` subfolder (originals untouched), ZIP fallback |

Shared across tools: three-channel upload (click / drag / paste), a site-wide tool navigator, and per-tool SEO landing pages.

## Why

- **Zero-build, zero-dependency core** — native ES Modules; the only runtime library is JSZip, lazy-loaded from CDN the moment you click ZIP (with fallbacks). Deployable as static files anywhere.
- **Byte-level where it matters** — EXIF stripping and renaming never re-encode (zero quality loss); compression and conversion expose honest levers instead of magic.
- **Shared engines, tested** — the watermark/fit engine and the EXIF module are shared with sibling projects and covered by regression tests (`tools/test-engine-math.mjs`, `tools/test-exif.mjs`).
- **No limits** — no accounts, no quotas, no telemetry; everything stays on your machine.

## Quick Start

```bash
git clone https://github.com/ikoobee/pixmatrix.git
cd pixmatrix
npx --yes serve .          # any static file server works
# open http://localhost:3000 — or jump straight to /grid/, /compress/, ...
```

Run the regression tests (Node 18+):

```bash
npm test
```

## UI language

The interface ships bilingual (中文 / English) with a language selector in the navigator; the choice persists per browser and `?lang=en` deep-links work. The blog and legal pages remain Chinese-only for now. Code, comments, commits and these README files are English-first.

## Self-hosting

Replace `your-domain.example` across the HTML pages, `robots.txt` and `sitemap.xml` with your domain, then drop the folder on any static host. Analytics ship disabled (`provider: 'none'` in `js/analytics.js`). The ZIP features load JSZip from a public CDN at click time — self-host the file and update the `ZIP_CDN` constants if that matters to you.

## Contributing

Issues and PRs are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). By contributing you agree your contributions are licensed under the project's MIT license (inbound = outbound).

## License

[MIT](LICENSE) © Ethan (ikoobee)
