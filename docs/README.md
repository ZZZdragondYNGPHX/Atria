# Product documentation

This directory is the VitePress product documentation site. The public landing page is [index.md](index.md).

| Directory | Contents |
| --- | --- |
| `guide/`, `basics/` | Setup, usage and core concepts |
| `features/`, `improvements/`, `recipes/` | Product behavior and walkthroughs |
| `development/` | Developer guides, API references and current contracts |
| `zh-CN/`, `zh-TW/` | Translations using the same page structure |
| `public/images/`, `public/screenshots/` | Images actually referenced by published pages |
| `.vitepress/`, `scripts/` | Site configuration and documentation tooling |

Current developer contracts: [Resource Bundle](development/resource-bundle.md), [Localization](development/localization.md).

Repository governance, Plans, Records and the live HANDOFF are maintained in the independent `docs` branch (`git show docs:README.md`), not duplicated here. QA captures that are not used by a page stay out of the tracked site assets. New screenshots selected for publication can be added explicitly with `git add -f docs/public/screenshots/<path>`.

Run `npm ci` in this directory once, then `npm run dev` or `npm run build`. The diagram pre-render step needs the local `d2` CLI.
