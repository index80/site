# Security Policy

This policy covers the INDEX:80 website, its build and data pipeline, and the code in this repository (`index80/site`).

## Reporting a vulnerability

**Please report suspected vulnerabilities privately. Do not open a public issue or pull request for them.**

- Email **hello@index80.com** with the subject line `SECURITY`.
- Where GitHub private vulnerability reporting is enabled for this repository, you may use the **Security → Report a vulnerability** tab instead.

Please include:

- what you found and where (file, URL or component);
- steps to reproduce, or a proof of concept;
- the impact you believe it has;
- whether you want to be credited.

Do not include real credentials, wallet secrets or private data in your report; describe them instead.

## What to expect

- We aim to acknowledge a report within **5 working days**.
- We will investigate, tell you whether we consider it a valid security issue, and keep you informed of progress.
- INDEX:80 is maintained by a very small team. We cannot promise fixed remediation deadlines or a bug bounty.

## Responsible disclosure

Please give us a reasonable opportunity to investigate and fix an issue before you disclose it publicly. Please do not access, modify or delete data that is not yours, do not degrade the live service (no denial-of-service or load testing), and do not test against third-party services listed in the index.

## What counts as a security issue

- exposed credentials, secrets or tokens;
- unintended access to non-public data;
- build or deployment behaviour that could publish unintended material;
- supply-chain or dependency compromise;
- vulnerabilities in site code, the Cloudflare Worker or the submission pathway that could affect visitors, maintainers or deployment integrity.

## What is not normally a security issue

Use the normal contribution or correction routes (see [CONTRIBUTING.md](CONTRIBUTING.md), or email hello@index80.com) for:

- an outdated project link or incorrect summary;
- an editorial classification dispute or a missing project;
- a request to correct or remove a third-party asset (see [docs/ASSET_PROVENANCE.md](docs/ASSET_PROVENANCE.md)).

## Supported versions

Security fixes are applied to the current maintained code (`main`, with `dev` as the preview branch). Historical branches and superseded prototypes do not receive separate fixes.

## Secrets in this repository

No secrets belong in this repository. If you find something that looks like a credential, key or private file, treat it as a security report and use the private route above.
