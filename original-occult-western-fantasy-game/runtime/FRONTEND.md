# Native frontend — Eastbank Field Register

## Long-lived-world Phase 7

Current implementation is `2.0.0-phase7`; this is not a release. It preserves
opening-era flows below and adds three primary destinations, bounded Chronicle
and public world reads, exact calendar review, complete paged long-term forms,
public identity/absence, delegation policy edits, real regional travel and
checkpoint-aware Reply Retry. See `frontend/DESIGN.md` for the actual binding map.

Presentation uses 249/256 schema nodes and 90 bindings. Wrapped opening read
schemas remain 234/6/171/6 nodes. There are still 64 transactions, 9 publication
reads and 15 publication commands; Lifetime enterprise policy edits reuse the
existing grouped command budget. Native query rows stay at most 12 per page,
with revision/query-bound opaque cursors, at most 128 postings and 54 yearly
intervals. Public world payloads have a 10000-byte page budget; artifact details
show the latest eight provenance links and the full link count. No limit is raised.

The compiled free-text resolver keeps all declared tools and unchanged input
schemas. Concise public operation descriptions leave room for the complete
16 KiB public observation and a 256-character inquiry inside the existing
64 KiB combined request limit. UI risk notices retain their full authored text.
The builder checks this reservation through the actual Native resolverRequest.

Long intervals use Gregorian ordinal civil instants. Native simulation exposes
both the requested and resolved target; optional attention chooses existing
Lifetime/journey milestones before bounded simulation. Omitted attention retains
existing programmatic advance behavior. AUI does not calculate eligibility,
forecast outcomes, simulate days, or convert years by multiplying 365.

The existing `--frontend-only` harness now contains opening regression and the
Phase 7 acceptance scenarios, followed by real export/import into fresh FS with
**all states and Timeline** equality. Native setup transitions are distinguished
from UI actions. `--phase7-ui-only` remains a focused diagnostic and is not stage
acceptance. Century UI fixtures do not establish Gate C, high-turn growth,
physical-device behavior, hosted-model quality or old-version migration.

Screenshots cover 375/390/768/1024/1440 widths, 812x375 landscape and 200% root
text. Back focuses the static result wrapper because repeated NodeRefs are
forbidden. Current public institution/place details link bounded prior records;
they do not load a whole historical graph. Local MySQL/PostgreSQL integration is
not claimed; FS/SQLite are tested locally, with hosted adapter checks recorded
separately when executed.

## Preserved opening-era scope and authority

P8 presents the existing P5–P7 game through Native Frontend v3. It adds no transaction, gameplay, content catalog expansion, authority domain or world simulation rule. `frontend/DESIGN.md` owns the reviewed visual direction. `frontend/Inquiry.aui`, `inquiry.css`, `inquiry-controller.js` and `inquiry-model.js` are compiled by `tools/frontend-compile.mjs`; the existing Main.aui is retained for the independent regression fixture.

The UI reads only four closed player-safe projections: opening_summary_projection, player_matters, investigation_nodes_projection and investigation_edges. These are the same safe projection authorities used by Information, not mixed hidden Lifecycle records. The two declared Information Graphs and advisory tasks remain unchanged. Typed action fields and catalog descriptions are generated from existing contracts. Filtering and selection are presentation-only; Native authority owns eligibility, RNG, time and publication.

## Surfaces and behavior

- Field notes: conversation, Host Composer, six ordinary-identity creation steps and reviewed typed actions.
- Evidence: acquired records, provenance/custody, attributed Testimony, Findings, revisable Hypotheses, search, selected relations and explicit empty states.
- Cases: known mandates, arrangements, continuing consequences and six independent Hearing terms. No quest-completion score or binary reveal/hide ending.
- Identity: ordinary background, Seed versus formal Claim, Anchor, jurisdiction, enforceable Prices, institutional duties and existing Host save/restore.
- Reflection and Claim Advisor: Native operations over approved context; advisory output has no Apply Command.

Risk review is tied to the current field signature; changing a field requires renewed review. Pending typed operations block competing writes and keep the original input/revision/idempotency key. A retry does not renew an expired epoch to conceal unknown commit status. Mount/recovery never resubmits. Drafts are process-local presentation, not an uncommitted-request journal. The Host owns bridge renewal, Composer and save semantics.

## Accessibility and visual review

A marine-cover/paper register, system serif headings and system sans controls replace generic dashboard styling. The layout retains normal scrolling, explicit labels, inline errors, a skip control, visible keyboard focus, native disclosure controls and 44px controls. Risk consent is a deliberate exception to the general guideline to leave submit enabled. Motion is limited to short press/hover feedback and disabled under reduced motion. A fixed light/paper color scheme is intentional, including under dark OS preference; this is not a separately authored dark theme.

Final review used the current Vercel Web Interface Guidelines fetched on 2026-10-01 and installed ui-ux-pro-max guidance. Real Edge Chromium screenshots caught two issues missed by outer-container overflow assertions: mobile brand words touching and enlarged navigation text overlapping; both were corrected. The navigation now auto-fits columns under enlarged text. The marine navigation also overrides the general light hover color to preserve contrast.

Package tabs are bounded local presentation rather than browser routes. There is no browser-history/deep-link capability added to the Native sandbox, no beforeunload API, no third-party fonts, media, analytics or hydration layer. Unsubmitted text is not claimed to survive a process restart. Platform-specific screen-reader and physical-device behavior have not been verified.

## Validation commands

Run from the game directory against an independent current main checkout:

```text
node tools/frontend-model-check.mjs
node tools/package.mjs validate --core <main-checkout> --frontend-only
node tools/package.mjs validate --core <main-checkout>
node tools/package.mjs validate --fixture --core <main-checkout>
node tools/package.mjs build --core <main-checkout> --out <new-build-path.atria>
```

The frontend test uses actual Native compilation/installation/Ready, real browser rendering, Host bridge requests and a local synthetic HTTP provider. It covers six UI creation steps, zero-publication provider failure and identical-request retry, acquired evidence/graph inspection, six Hearing terms, 48 bounded catalog options, SavePoint, Reflection/Advisor, 375/390/768/1440 widths, landscape, 200% root text, keyboard, reduced motion, dark OS preference and hover contrast. It additionally exports a real save container, imports it into fresh FS, checks same-version authority and next-day Claim/Hearing continuation, and rejects day31 without mutation. Native setup actions for later game states are explicitly distinguished from UI clicks in the test.

The fixture remains a separate Package identity/version. Local synthetic HTTP is not hosted-model evidence. Browser screenshots are not Android/Termux or physical touch-device evidence. Old-version migration and cross-process uncommitted selection recovery remain unsupported.

## Historical opening-era budgets

Unchanged authority:64 transactions;9 publication reads/15 commands;maximum declared combination24;Evidence schema248/256, summary232/256 and Graph169/256. Intent retains compact nodes rather than the rich Graph bundle. Full default regression observes at most15 reads/17 commands/19 effects and12632 observation bytes. The frontend scenario observes13/14/16 and10463 bytes.

The original v1 baseline used presentation schema188/256;79 bindings;wrapped read schemas234,6,171,6 nodes. No field/ref/formula/UTF-8/expanded-work budget is increased. `authority-transaction@1`, `world-simulation@1`, Ready, static targets,30-day horizon, <=2880-minute advance and maxSteps3/maxDeliberations1 remain.

Exact tested commits, final logs, screenshot evidence, Core prerequisite fixes and artifact hash are recorded in the sole Package Record. P8 does not publish a release; that remains P9.
