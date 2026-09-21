# Asset Provenance and Rights Boundary

INDEX:80 is an index of other people's projects. Much of what appears on the site and in this repository is therefore **not** INDEX:80's own work. This document states plainly what is and is not covered by any licence INDEX:80 applies to its own material.

## Third-party assets

Project logos, icons, favicons, screenshots, Open Graph and social-media images, video frames, press-kit artwork and other brand assets stored under `public_html/assets/project-images/` (and any similar third-party material elsewhere in the repository) are the property of their respective rights holders.

- They are included for **identification, editorial and reference purposes** only, to help visitors recognise the project a record describes.
- Their inclusion **does not grant any right** to copy, redistribute, modify or relicense them, and no licence applied to INDEX:80's code or data extends to them.
- Their inclusion **does not imply endorsement** of INDEX:80 by the project, or of the project by INDEX:80, nor any affiliation.
- Names, logos and marks remain the trademarks of their owners.

Anyone reusing this repository must obtain any necessary permission from the relevant rights holder for these assets, or remove them.

## Other material that is not INDEX:80's own

- Photographs, avatars or likenesses of individuals (for example, files in `public_html/assets/images/` that depict or are taken from a named person's public profile) belong to the person or rights holder concerned.
- Any payment QR code or wallet address published on the site is provided for INDEX:80's own use and is not a reusable asset.
- Text quoted or summarised from a project's own site remains subject to that project's rights; INDEX:80 summaries are editorial descriptions, not copies.

## How provenance is recorded

Every harvested or supplied project image is described in `public_html/data/project-images.json`, with, where available:

- `path` — the stored file;
- `kind` — how the image was obtained (for example favicon, OG image, official brand kit, product screenshot);
- `source_url` — the public page or file it came from;
- `fetched_at`, dimensions and a `status`;
- an optional `note`.

This provenance data is part of the public record and should be preserved. Where an image was supplied directly by a project team rather than fetched, the `note` says so and `source_url` points to the project's public site rather than any private location.

Policy: use official, project-controlled imagery only; never fabricate or reconstruct a logo; if no suitable official image exists, the site falls back to a generic category icon.

## Corrections and takedowns

If you are a rights holder or represent a listed project and want an asset corrected, replaced or removed, email **hello@index80.com** with:

- the project or file concerned (URL or repository path);
- your relationship to the rights holder;
- what you would like done.

We will review requests promptly and remove or replace assets where appropriate. Removal from the current site and repository does not remove copies already in Git history or third-party caches.

## Reserved INDEX:80 brand material

The INDEX:80 name, logo and original INDEX:80 brand and mascot illustrations (for example the `index80-*` images under `public_html/assets/images/` and the INDEX:80 icons under `public_html/assets/icons/`) are reserved by the project owner. They are **not** licensed under Apache-2.0 or CC BY 4.0, and no permission is granted to use them as trademarks, to imply endorsement, or to redistribute them. To ask about permitted use, email **hello@index80.com**.

## Relationship to licensing

INDEX:80's software is licensed under Apache-2.0 ([LICENSE](../LICENSE)) and its structured data and original editorial content under CC BY 4.0 ([LICENSE-DATA.md](../LICENSE-DATA.md)); see [NOTICE](../NOTICE). Neither licence extends to third-party assets or to the reserved INDEX:80 brand material described above.
