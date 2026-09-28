# Native product UX — Group 2

Branch: `fix/native-product-ux-audit`; pushed HEAD: `c863c0536`.

## Group 2 — Native Runtime / Provider Foundation

### NUX-003

Production registers four Native adapters. All use the existing exact Runtime
Route, configuration, PromptIR, capability and Secret-at-send boundaries.

| Adapter | Tools / structured output | Reasoning | Explicit cache |
| --- | --- | --- | --- |
| OpenAI-compatible messages | Function tools, JSON Schema | effort | key, in-memory / 24h retention |
| Anthropic Messages | Function tools, JSON Schema | adaptive effort or enabled token budget | automatic ephemeral, 5m / 1h |
| Gemini GenerateContent | Function tools, JSON Schema | budget or level | unsupported |
| Raw text completions | unsupported | unsupported | unsupported |

All support streaming. Protocol capability evidence does not override known
unsupported model capabilities. Unknown fields/combinations fail before Secret
resolution. Anthropic/Gemini preserve leading system authority and reject
interleaved system slots that cannot retain their original position. Unsupported
modalities fail rather than disappearing. Signed provider tool content survives
the Studio loop and remains bound to the connection, model and original message.
Their local budget check uses a conservative UTF-8 byte bound, not an inaccurate
OpenAI tokenizer. Gemini external cached contexts are rejected because their
unavailable contents cannot participate in Native context accounting.

Runtime editors reuse existing fields, focus, responsive sheets and translations.
Gemini accepts an API base URL; other transports accept the generation endpoint.
Provider model discovery and connection health remain NUX-005, next after NUX-004.

Validation: seven focused/adjacent suites, 120 tests passed; final changed tests
rechecked (15 passed). Real local HTTP covers both new protocols, streaming and
nonstreaming authentication. Real Edge narrow/light profile editing and exact
revision preservation passed; inspected the 320px provider-controls screenshot.
Changed-file ESLint and diff checks passed. Live paid provider accounts were not
used; protocol behavior is tested against controlled HTTP servers.

Protocol references: [OpenAI Chat](https://developers.openai.com/api/reference/resources/chat),
[Anthropic Messages](https://platform.claude.com/docs/en/api/typescript/messages),
[Anthropic thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking),
[Anthropic caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching),
[Gemini generation](https://ai.google.dev/api/generate-content),
[Gemini thinking](https://ai.google.dev/gemini-api/docs/thinking).

### NUX-004

Connection setup now selects labeled exact Secret references or creates a Secret
inline. The authenticated Native inventory returns IDs/labels only, independent
of secret exposure preferences. Creation reuses SecretManager and its atomic
file store under an Atria key; it does not rotate active credentials. The Native
backup write gate applies. Connections never receive the key value.

The existing editor handles empty/loading/retry, failed creation, double clicks,
stale inventory responses, cancellation and clearing sensitive inputs after
success/cancel. Secret selection and create fields use existing form primitives
and Chinese translations. Creating a Secret and saving a connection remain
explicit separate actions.

Validation: three suites / 35 tests passed, covering real authenticated Secret
HTTP, metadata-only output, ownership rejection, write gate, exact selection,
creation retry and existing generation contracts. Two real Edge 390px scenarios
passed including Secret creation, connection save failure/retry and configuration
loading recovery. Inspected the connection screenshot. Changed-file ESLint and
diff check passed. Only synthetic credentials were used.

### NUX-005

Connection Test and Model Fetch use a non-generating authenticated model-list
probe over the explicitly selected Native connection. Protocol endpoint mapping,
authentication, bounded pagination, timeout, redirect rejection and response
validation are explicit. Unsupported custom endpoints retain manual model entry.
No probe saves configuration or silently selects a model.

Model selection edits only the draft ID. Applying discovered metadata is separate
and explicit. Anthropic/Gemini documented capabilities and limits retain provider
discovery provenance; OpenAI model lists do not invent absent metadata. Optional
ModelProfile.limitProvenance records each budget source in the existing resource.
Manual budget edits become user overrides; capability overrides survive metadata
application. Changing model/connection removes old discovery provenance.

Validation: five focused/adjacent suites, 64 tests passed, then 21 changed tests
passed including malformed/credential-echo/pagination-loop cases. One real Edge
320px discovery scenario passed, repeated after reusing existing field-group
spacing; final screenshot inspected. Changed-file ESLint and diff checks passed.
HTTP protocol tests use local servers; browser discovery uses a controlled
response and the real configuration persistence endpoint.

Model-list references: [OpenAI](https://developers.openai.com/api/reference/resources/models/methods/list),
[Anthropic](https://platform.claude.com/docs/en/api/models/list),
[Gemini](https://ai.google.dev/api/models).

### NUX-006

Runtime Connections, Models and Routes can be duplicated into an unsaved new
identity and deleted when unreferenced. Deletion reports Used By blockers for
model/connection ownership and fallback routes. Persistence serializes writes
and deletion checks across instances in the server process, following the Native
Session pattern required by FS transaction semantics. Referencing saves recheck
target existence; fallback fixtures now create dependencies before callers.

Library Prompt/Generation resources intentionally retain immutable revisions.
Archive/restore changes only root-list metadata, never exact content. Active and
Archived filters expose recovery; a new revision does not silently unarchive.
Existing Runtime routes and Resource Graph references still resolve archived
content. Library Used By combines existing Graph results with exact Runtime route
references. Package originals do not expose archive or revision writes.

Validation: six relevant suites covering 84 cases; the final frontend changes
were rechecked with 17 passing cases. Includes delete blockers, cross-instance
concurrent delete/save, immutable archive/restore, backup gate, duplicate identity
and neighboring generation/authoring regressions. One real Edge 320px scenario
passed: blocked deletion, duplicate/delete, Library Used By, archive and restore.
Both screenshots inspected. Changed-file ESLint and diff check passed.

### NUX-007

Library → Generation Profiles is the canonical authoring home. Runtime's Profiles
navigation and editor are removed, as is PUT configuration/profiles. Runtime
Routes link to Library while retaining exact selected revisions. Existing
programmatic profile navigation redirects to that same Library owner.

Before removing the Runtime editor, all sampling/output/streaming/stop/tool and
provider reasoning/cache controls were moved into the existing Library/Studio
Generation editor. Simple/Advanced round trips preserve settings, unsupported
retained values remain visible, numeric/JSON validation keeps drafts, and omitted
streaming remains omitted. Studio continues its Review/Apply write path; Library
uses the immutable resource endpoint. Archive and exact revision behavior remain.

Validation: four suites / 45 tests passed, followed by eight passing editor cases
including the new control round trip. One real Edge light 320px Library scenario
passed: invalid JSON recovery, provider controls, immutable save, unchanged route
revision and canonical owner link. Screenshot inspected. ESLint passed with only
three pre-existing conditional-test warnings in the older Runtime E2E file;
diff check passed.

### NUX-008

Fallback choices now include only other same-role routes and exclude already
selected entries. Role changes remove incompatible draft fallbacks with explicit
feedback. Backend persistence rejects both outgoing role mismatches and changes
that would invalidate incoming fallback references; the HTTP boundary returns an
actionable role-conflict code.

Validation: three backend suites / 63 tests passed, plus the adjacent Runtime
client suite / 10 tests. A pre-existing concurrency fixture now detaches the
fallback before assigning a different role. One real Edge fallback scenario
passed: wrong-role option absent, role-change cleanup, valid selection and exact
route identity preserved. Changed-file ESLint and diff check passed.

### NUX-009

Diagnostics now reads Build's Project inventory and selects its current exact
revision. Raw IDs are confined to Advanced context details. Refresh preserves an
unchanged pin and requires explicit reselection when Build has changed; failed,
empty, overlapping and disposed inventory loads cannot submit an unverified
context. Native Session remains the context owner when active. Historical Project
execution is not introduced: the existing host accepts the current exact revision.

Validation: Runtime client suite / 12 tests passed, including stale-pin refresh,
exact request payload and failed/overlapping inventory recovery. Two real Edge
Diagnostics scenarios passed, including creating a real Build Project and compiling
its exact revision at 320px. Screenshot inspected; ESLint and diff check passed.

### NUX-010

Runtime lists now share a dependency-ordered setup disclosure computed from the
existing Secret metadata, Runtime configuration and exact resource catalogs.
The next missing dependency links to its canonical Runtime or Library owner.
Readiness verifies linked Connection/Model/Route references and exact resource
revisions rather than just counting records. Archived resources continue to
satisfy existing pins. Refresh and recoverable inventory errors are supported;
no setup state or duplicate configuration authority is persisted. Linked status
explicitly directs users to Diagnostics before generation.

Validation: two adjacent suites / 15 tests and the new readiness suite / 3 tests
passed. One real Edge 320px scenario verified the six-step checklist, missing
Secret and canonical Connection navigation; screenshot inspected. ESLint and
diff check passed.

### NUX-011

Product HTTP and UI now share a bounded, allowlisted error-detail contract.
Field and exact reference blockers survive client and Library boundaries; raw
exception messages, arbitrary payloads and sensitive fields are excluded.
Known dependency, permission, encrypted-save, immutable revision, write-conflict
and read-only errors provide corrective action, with safe status-based fallbacks.
World/Knowledge name validation and archive validation carry field context.
All existing caller feedback uses text nodes and retains focus/error behavior.

Validation: five focused/adjacent suites / 18 tests passed. All eight real Edge
Library scenarios passed, covering installation retry with retained input,
referenced Work deletion with the exact blocking Session, World/Knowledge editing,
resource revision retry, Skills and compact Chinese layouts. Reference-error
screenshot inspected. Changed-file ESLint and diff check passed.

### Group 2 regression

All 22 selected Native Runtime/provider/Secret/resource/Product and client suites
passed: 214 tests, no skips. Real Edge regression passed all 24 scenarios across
Runtime redesign (10), Library redesign (8), Runtime edit/preview/recovery (4)
and Library/Studio authoring (2). Viewports covered 320, 390, 900 and 1440px,
light/dark and Chinese surfaces. Existing optional Stable Diffusion discovery in
the older fixtures logged localhost:7860 connection failures; all six Runtime/
authoring tests still passed with no page errors. No external paid-provider,
physical-device, Docker or Android-build validation is claimed.

Next: Group 3 / NUX-012, following the active backlog order.
