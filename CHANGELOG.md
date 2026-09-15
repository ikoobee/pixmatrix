# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-09-15

Initial public release.

### Added

- Eight in-browser tools on one static site: nine-grid slicing (with
  optional watermark pass), compression (quality + size levers, PNG
  strategy), format conversion, exact-pixel resizing (cover/contain/blur
  fit modes), EXIF view & byte-level strip, long-image stitching,
  screenshot beautifying, batch rename (FSA directory write with ZIP
  fallback).
- Shared layer: three-channel upload (click/drag/paste), toast, site-wide
  tool navigator, per-tool SEO landing pages.
- Regression tests for the shared engine math and EXIF module
  (`tools/test-engine-math.mjs`, `tools/test-exif.mjs`).
- Zero dependencies, zero build — native ES Modules; JSZip lazy-loaded
  from CDN only when packaging ZIPs.

### Decisions

- No accounts, no quotas, no telemetry — every tool is unlimited and
  fully local.
- The UI is Chinese-only by design (Chinese long-tail search intents);
  code and docs are English-first. See README for the rationale.
