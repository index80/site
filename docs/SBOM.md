# INDEX:80 Software Bill of Materials / Dependency Evidence

Record date: 21 September 2026  
Repository: `https://github.com/index80/site`

## Scope

This record covers the **public open-source website/source package** used for the INDEX:80 Tooling Sustainability funding application.

It does not claim that separately governed private operational tooling is public source. The private production/editorial operational repository remains outside this SBOM scope.

## Public package

Path: `package.json`

- package: `index80`
- version: `0.4.0`
- licence: Apache-2.0
- runtime dependencies: **none**
- development dependencies: **none**
- package lock: none required because no npm dependencies are declared
- build runtime: Node.js 22 plus repository-local scripts

The public static site therefore has no npm package dependency chain.

## GitHub Actions

The public CI workflow `.github/workflows/ci.yml` currently references:

| Action | Version | Purpose |
| --- | --- | --- |
| `actions/checkout` | `v4` | repository checkout |
| `actions/setup-node` | `v4` | Node.js 22 setup |

These are CI service dependencies and are not software shipped to website visitors.

## Excluded private operational tooling

The private operational repository contains additional tooling that is **not exported as part of this public repository**.

For boundary transparency, `tools/registry-anchor-publisher` in the private repository has its own committed `package-lock.json` and directly declares:

- `@emurgo/cardano-serialization-lib-asmjs` 17.0.0 (runtime);
- `esbuild` 0.25.9 (development).

Those dependencies belong to an excluded private operational surface and are not dependencies of the public website/source package represented by this SBOM.

## Machine-readable SBOM

`docs/sbom.cdx.json` is the formal CycloneDX 1.6 record for the public application package.

Because the public package declares no npm dependencies, its dependency graph intentionally contains the INDEX:80 application component with an empty `dependsOn` list.

## Maintenance

Refresh this evidence when:

- `package.json` changes;
- a public package-manager manifest or lockfile is introduced;
- CI action dependencies materially change;
- a private operational dependency is moved into the public package;
- a funding/compliance submission requires a fresh record.
