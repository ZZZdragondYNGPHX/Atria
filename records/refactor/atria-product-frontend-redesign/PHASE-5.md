# Frontend redesign — Phase 5 Runtime

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../../README.md#122-minimal-validation-and-runtime-checks)。

- Date: 2026-09-24
- Branch: `refactor/atria-product-frontend-redesign`
- Starting HEAD: `1ee087510c39926616ccc8cfad22cb435e63de36` (Phase 4)
- Implementation HEAD: `853c590bff9169a5e29804bd9fe565a4371b51a4`
- Main implementation: `1ec5c0fe6b9c01b495db98a44e184e6ead7fede5`; final HEAD includes diagnostics polish.
- Not merged into main.
- Phases 1–5 complete; Phases 6–8 outstanding. Stop pending user continuation.

## Delivered

Runtime Routes, Models, Connections, Profiles and Diagnostics now use the approved
system-settings direction: grouped semantic forms, aligned desktop label/value
rows, full-width compact fields, resource lists and on-demand stable-ID details.
The existing Native configuration client and serializers retain ownership.
Runtime presentation moved from Shell CSS into `atria-runtime.css`; shared request
feedback remains available to Play. Medium/compact section selection uses the
existing WorkspaceHost destinations through a labelled native picker.

Connections separates transport/endpoint from the exact Secret reference. Models
separates connection, token budget and capabilities/provenance. Routes separates
role/model binding, exact resources, fallback order and request policy. The stale
claim that visual Prompt authoring is unavailable is replaced with the existing
Library Prompt Programs destination. Diagnostics groups route/context/input, explains active Session ownership,
hides and disables irrelevant Project inputs, focuses results/errors and retains disclosed
request evidence. Preview never sends generation or changes Session state.

Compact editors use the existing Environment authority (719px boundary and measured
visual viewport), adapt when resized, retain fields, trap Tab, consume Escape,
restore Shell inert state and return focus. Errors receive focus; pending writes
are deduplicated and announced; successful writes followed by failed refresh keep
committed-state feedback. Late loads cannot replace newer views. Same-section
navigation out of a deep-linked editor restores its list. Shared loading/empty
primitives, dark/light tokens and simplified/traditional Chinese complete the flow.

## Boundaries

No backend, router, configuration store, Secret store or runtime authority changed.
User names/remote identifiers/resource options are literal data, not translation
keys. No migration support is restored; legacy migration remains retired.
No Phase 6–8 content was implemented.

During implementation external edits appeared in root `AGENTS.md` and
`FORK_MAINTENANCE.md`. They were read, preserved and excluded from this commit.
Do not overwrite those external local edits during the next phase.

## Review and polish

Formal DESIGN remains authoritative. frontend-design guided hierarchy;
ui-ux-pro-max informed focused errors and responsive forms. web-design-guidelines
was fetched from its upstream command.md and used for implementation review.
emil-design-eng supplied final interaction polish.

| Before | After | Why |
| --- | --- | --- |
| Flat, continuous Runtime form | Semantic groups with aligned fields and disclosed IDs | Separate configuration decisions without nested cards |
| Old 700px modal and fixed viewport height | Environment-driven 719px mode, measured viewport and resize adaptation | Preserve focus/draft across compact and keyboard transitions |
| Hidden focus after a failed save | Focusable inline feedback and retained draft | Keyboard recovery stays attached to the edit |
| No visible pending-save message | Saving status, aria-busy and a single pending write | Prevent duplicate revision writes and explain progress |
| Inline CSS island in Shell | Runtime stylesheet using existing tokens | Keep the owning domain coherent |
| Mid-width picker caption wrapped | Nonshrinking caption and full-width compact selection | Stable navigation hierarchy |
| Keyboard focus ring clipped at viewport edge | Scroll margin on interactive controls | Keep the whole focus indicator visible |
| Compiled evidence touched the submit button; active Session left irrelevant fields visible | Separate result section and conditional Project fields | Make preview ownership and outcome easy to read |
| Technical transport copy untranslated | Chinese forms and protocol/help text | Coherent localized configuration experience |

## Limits and next phase

Physical Android/Termux/IME, external model credentials/services, Docker/Android
builds, SQL backend matrix and the full repository test suite were not run.
Keyboard and safe areas were simulated in an actual browser. Existing unsupported
transports and Generation controls remain explicitly unsupported; this phase does
not introduce new runtime capability. No known unfinished Phase 5 item remains.

After user continuation, execute **Phase 6 — Build / Studio** on the same branch:
complete authoring workspace, review/ChangeSet/conflict, preview and Project Agent,
preserving inspect/review/execute, exact revisions and human authority. Fetch and
read latest handoff first; do not reset unmerged Phases 2–5 to main or redo them.

## Selected screenshots

![Routes desktop](phase-5-images/routes-1440.png)
![Route editor desktop](phase-5-images/route-editor-1440.png)
![Model medium](phase-5-images/model-medium.png)
![Model capabilities](phase-5-images/model-capabilities.png)
![Compact loading](phase-5-images/loading-390.png)
![Compact save error](phase-5-images/save-error-390.png)
![Exact revisions light 320](phase-5-images/route-exact-light-320.png)
![Keyboard light 320](phase-5-images/model-keyboard-light-320.png)
![Diagnostics light medium](phase-5-images/diagnostics-error-medium-light.png)
![Connection Chinese light 320](phase-5-images/connection-zh-light-320.png)
