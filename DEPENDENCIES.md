# Dependency Position

INDEX:80 deliberately keeps the public website/build package low-dependency.

## Public funding/application surface

Repository: `index80/site`

The root `package.json` declares:

- runtime dependencies: **none**;
- development dependencies: **none**;
- build runtime: Node.js 22 plus repository-local scripts;
- package lock: **none required**, because the public package declares no npm dependencies.

The public static site therefore has no npm package dependency chain in its ordinary build or runtime.

## CI dependencies

The public CI workflow uses GitHub-maintained actions:

- `actions/checkout@v4`;
- `actions/setup-node@v4`.

These are CI service dependencies, not JavaScript packages shipped to website visitors.

## Public/private boundary

INDEX:80 production and editorial operations are maintained separately in the private operational repository `index80/index80`.

That private repository contains tooling that is intentionally **not part of the public `index80/site` source package**, including the isolated registry-anchor publisher. Its package dependencies must not be presented as dependencies of the public funding package.

For transparency, the private registry-anchor publisher currently uses a committed lockfile and declares:

- runtime: `@emurgo/cardano-serialization-lib-asmjs` 17.0.0;
- development: `esbuild` 0.25.9.

This disclosure describes an excluded operational surface; it does not make that private tooling part of the public open-source package.

## Formal SBOM evidence

The public repository commits:

- [docs/SBOM.md](docs/SBOM.md) — human-readable scope and dependency evidence;
- [docs/sbom.cdx.json](docs/sbom.cdx.json) — CycloneDX 1.6 machine-readable SBOM for the public package.

Because the public package has no npm dependencies, the formal SBOM contains the INDEX:80 application component and an empty dependency set.

## Dependency changes

Any future third-party package dependency should have a clear maintenance reason and be reviewed for:

- maintenance activity and ownership;
- licence compatibility;
- security history;
- transitive dependency cost;
- whether it affects the public build/runtime or only a separately governed operational tool.

Material dependency changes should be reviewed through pull requests and reflected in the SBOM evidence before a funding or compliance submission.
