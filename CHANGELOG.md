# Changelog

All notable changes to the INDEX:80 public source are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). This repository does not yet publish tagged releases; entries are grouped by date, and the package version in `package.json` is `0.4.0`.

## [Unreleased]

### Added
- `SUPPORT.md` (where to get help, and what support does and does not cover).
- `CHANGELOG.md` (this file).

## 2026-09-21 — Public source launch

### Added
- Initial public source snapshot of the static site: `public_html/`, plain-Node generators and tests, and public data.
- Licensing: Apache-2.0 for code (`LICENSE`), CC BY 4.0 for structured data and original editorial content (`LICENSE-DATA.md`), and a `NOTICE` that excludes third-party assets and reserves the INDEX:80 name, logo and brand artwork. Asset provenance is documented in `docs/ASSET_PROVENANCE.md`.
- Community and governance documents: `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `GOVERNANCE.md`, `MAINTAINERS.md`, `CODE_OF_CONDUCT.md`, issue templates and a pull-request template.
- Continuous integration (`.github/workflows/ci.yml`): deterministic build, theme, registry history and integrity, home-directory, site-schema, treasury-rule and data checks.
- Registry verification tooling: an offline integrity test (`npm run test:registry-integrity`) and an online check of the Cardano metadata (`npm run verify:registry-onchain`).
- `ROADMAP.md`, `DEPENDENCIES.md`, `docs/SBOM.md` and a CycloneDX 1.6 SBOM (`docs/sbom.cdx.json`). The public package declares no npm runtime or development dependencies.

### Changed
- Registry release manifests are published without the private `source` object (repository and commit identifiers). Snapshots, receipts, snapshot hashes and Cardano transaction IDs are unchanged.
- `llms.txt` describes the Registry history as exposing "release provenance".
