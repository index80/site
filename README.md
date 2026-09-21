# INDEX:80 / CARDANO

Website source for **[index80.com](https://index80.com)** — an independent, human-reviewed and machine-readable index of the active Cardano ecosystem.

INDEX:80 is an independent project created and maintained by Adam Winstanley.

- Website: https://index80.com
- Source: https://github.com/index80/site
- Contact (corrections, takedown requests, security reports): hello@index80.com

This repository is the public source snapshot of the static site. Editorial research, deployment and operations are run separately by the maintainer; changes proposed here are reviewed and, where accepted, applied in that workflow.

## Licence and rights boundary

1. **Software** — site code, generators and scripts — is licensed under **Apache-2.0** ([LICENSE](LICENSE)).
2. **INDEX:80 structured data and original editorial content** — for example `public_html/data/projects.json` — is licensed under **CC BY 4.0** ([LICENSE-DATA.md](LICENSE-DATA.md)). Suggested attribution: "Data: INDEX:80 (https://index80.com), CC BY 4.0."
3. **Third-party assets** — project logos, screenshots, OG and social-media images, favicons, video frames and supplied brand assets — belong to their respective rights holders, are shown for identification and editorial reference only, imply no endorsement, and are **not** covered by either licence. See [docs/ASSET_PROVENANCE.md](docs/ASSET_PROVENANCE.md).
4. **Reserved INDEX:80 brand material** — the INDEX:80 name, logo and original brand and mascot artwork — is **reserved** and not licensed under Apache-2.0 or CC BY 4.0.

See [NOTICE](NOTICE) for the consolidated statement.

## Project documents

[CONTRIBUTING.md](CONTRIBUTING.md) · [SECURITY.md](SECURITY.md) · [GOVERNANCE.md](GOVERNANCE.md) · [MAINTAINERS.md](MAINTAINERS.md) · [ROADMAP.md](ROADMAP.md) · [DEPENDENCIES.md](DEPENDENCIES.md) · [SBOM](docs/SBOM.md) · [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## Architecture

INDEX:80 is deliberately static-first: semantic HTML, modern CSS, plain JavaScript, static JSON and no framework.

- `public_html/` is the deployable site. Project pages under `public_html/projects/<slug>/` are **generated** from `public_html/data/projects.json` — do not hand-edit them.
- `scripts/` holds the plain-Node generators and tests (no runtime dependencies).
- Live Cardano market data is served by a separate service and read by the Data page; visitors never trigger paid third-party API calls.

## Build and test

Requires Node.js 22 or newer. There is no install step.

```bash
npm run build                 # regenerate pages, schema, sitemap and Registry history
npm run test:generated-output # two builds are identical and stay inside the generated surface
npm run test:registry-history
npm run test:registry-integrity
npm run test:theme
```

To preview locally: `npm run build && cd public_html && python3 -m http.server 8000`.

## Submission form

`/submit/` is included as a static page so the site can be reproduced, but the server-side service that receives and stores submissions is **private and is not part of this repository**. The form therefore only works on https://index80.com. To propose a project or a correction, use the live form or email hello@index80.com.

## Registry verification

INDEX:80 publishes a public Registry of dated snapshots (`public_html/registry/`). Each snapshot's SHA-256 is anchored on Cardano (CIP-190, metadata label 309). Anyone can verify:

```bash
npm run test:registry-integrity     # offline: snapshot bytes -> SHA-256 -> receipt -> proof
npm run verify:registry-onchain     # online: confirms the on-chain metadata via Koios
```

## Content status

Project records are editorial descriptions that are only as current as their last verification, and are not financial or investment advice. To request a correction, use https://index80.com/submit/ or email hello@index80.com.
