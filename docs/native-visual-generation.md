# Native visual generation contract

The Native image core uses schema 2. Old NovelAI-only image request snapshots
are rejected with `native_visual_schema_cutover_required`; there is no v1
execution adapter. Narrative Session, Branch, Revision, Runtime Connections,
Secrets, AssetStore and SavePoint remain their existing authorities.

`public/shared/native-visual-contract.js` defines bounded JSON SourceRef,
ImagePromptIR, target capability evidence, constraint negotiation and immutable
compilation evidence. Raw input is preserved. SHA-256 uses canonical sorted-key
JSON, matching Native document hashing. Credentials never enter these records.
Source anchors use UTF-16 offsets, immutable message/variant/revision identities,
the full content hash, and exact selected text. Source resolution also proves
committed ancestor reachability on the requested branch.

Image Target and Rendering are versioned Native resources (`core.image-target`
and `core.image-rendering`), using the existing Library resource handler. Target
owns model/workflow and native parameters; Rendering owns semantic style and
default target. Connection and Secret remain in the Runtime. Selection resolves
task, annotation, work, global in that order, independently for target/rendering.

The Native generation control plane owns preview, authorized submission, durable
job status/cancel, budgets, director and media operations. Native session
illustration commands own annotation drafts and display selection. All requests
use authenticated owner context and existing CSRF middleware. Writes use expected
head/hash; preview never resolves a Secret or sends a paid request. Asset bytes
use bounded authenticated upload/read endpoints, never unbounded JSON.

Errors distinguish invalid schema/source, conflict, capability unknown or
unsupported, expired evidence, unauthorized external transfer/payment, budget
exceeded and uncertain submission. Unknown remote submission is held for
reconciliation; cancellation does not promise refunds. Provider L1/L2 evidence
does not establish L3 availability.

Provider protocol sources (checked 2026-10-14):

- [NovelAI public OpenAPI](https://image.novelai.net/docs/doc.json),
  [V5 models](https://docs.novelai.net/en/image/models/) and
  [effort](https://docs.novelai.net/en/image/effort/). V5 has a separate compiler
  declaration and parameter version. Medium effort is not inferred from V4.5.
  NovelAI requires human initiation; automatic submission is refused.
- [ComfyUI server routes](https://docs.comfy.org/development/comfyui-server/comms_routes).
- [OpenAI Images generate](https://developers.openai.com/api/reference/resources/images/methods/generate)
  and [edit](https://developers.openai.com/api/reference/resources/images/methods/edit).

A protocol fixture establishes L1/L2 only. Live model IDs, account capability,
workflow installation and actual pricing remain separate L3 evidence.

Media Studio and persistence (schema 2)
--------------------------------------
`atri_illustrations` is a content-addressed presentation manifest containing
annotations, explicit reference bindings, and `{imageVersionId, head}` references.
Each immutable ImageVersion/evidence/DAG document is independently stored in
`atri_visual_image`. The API materializes that projection; Native runtime writes
cannot bypass either reserved namespace. No schema-1 migration channel exists.

Mask drafts use original top-left pixel coordinates, gray8 `0=preserve,255=edit`,
compressed base/recent checkpoints and at most 100 commands. Saves use CAS; idle
synchronization is 2 seconds, periodic synchronization 10 seconds. Undo/redo remain
local and persisted; compaction retains the latest 50 commands. Frozen MaskArtifact
bytes/hash/base geometry are independent of further draft edits. A conflict keeps
local edits and offers an explicit fork. Canonical masks are translated per Adapter.

Gallery defaults to current branch, 12 thumbnails per page. Full image/evidence
loads on demand. Results enter history; selecting a display version is a separate
CAS write. References are promoted explicitly by purpose/identity/branch and external
Connection grant. Hide/collection/soft delete are separate metadata actions. GC
quarantines unreachable temporary refs for at least 7 days (soft-deleted refs 30),
then rescans Native roots under the asset lock before removing refs. Shared blobs
retain the existing lease-aware GC contract.

Formal SavePoint and ordinary exports retain editable parents, evidence, masks,
reference inputs/bindings and hashes. Import checks DAG, base dimensions, mask byte
length and attachment closure. Ironman exports remain head-only for narrative:
immutable visual SourceRef is preserved through a checked presentation anchor alias
and frozen public visual packets; the alias never permits a missing historical World
read. No compact/display-only export is offered as a full editable SavePoint.

Provider mask guidance does not promise untouched pixels. The explicit “preserve
outside mask” option stores the provider result and a separate composite derivative;
compositing requires identical base/result geometry and can leave visible seams.
NovelAI precise references are V4.5-scoped and reject Vibe combinations. Vibe encoding
is still unknown and cannot trigger an implicit paid request. ComfyUI capabilities
come from reachable typed nodes/bindings, not a Provider brand or editable manifest.
