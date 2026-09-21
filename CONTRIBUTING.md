# Contributing to INDEX:80

Thanks for helping improve INDEX:80. Code changes and editorial/data changes follow different review paths.

## Ways to contribute

- report a bug or suggest an improvement;
- report a broken or outdated project link, or supply better primary-source evidence;
- improve documentation;
- propose a code change through a pull request.

## Before opening a pull request

1. Start from the current `main` branch.
2. Keep the change focused and explain why it is needed.
3. Run `npm run build` and the tests listed in the README; keep generated output reproducible.
4. Do not include credentials, private analytics, unpublished notes or private source material.

Pull requests are reviewed by the maintainer. Accepted changes are applied in the maintainer's own release workflow, so merge timing may differ from review timing.

## Generated files and data

Files under `public_html/projects/<slug>/` are generated and must not be hand-edited; change the generator instead and rebuild.

`public_html/data/projects.json` is a published export of INDEX:80's editorial records. Pull requests that edit project facts directly are not accepted; use a data-correction issue instead.

## Data corrections

Use the form at https://index80.com/submit/, email hello@index80.com, or open a *data correction* issue. (The form's server-side submission service is private and not part of this repository; the page here is the static front end only.) Please give the project name, the affected INDEX:80 URL, the fact that appears wrong, the preferred correction and a primary source where possible. A maintainer reviews the evidence before any project fact or status changes.

No contributor or sponsor can purchase inclusion, ranking, Featured status, verification outcome, removal of criticism, or preferred editorial treatment.

## Pull-request expectations

One clear purpose; no unrelated refactors; preserve the static-first architecture; do not bypass editorial governance; add or update tests when behaviour changes.

## Getting help

See [SUPPORT.md](SUPPORT.md) for where to ask questions, and [CHANGELOG.md](CHANGELOG.md) for notable changes.

## Licence of contributions

By contributing you agree your contribution is licensed under the licence that covers the file you change (Apache-2.0 for code, CC BY 4.0 for original data and editorial content). Third-party assets are not relicensed by contributing them; see [docs/ASSET_PROVENANCE.md](docs/ASSET_PROVENANCE.md).
