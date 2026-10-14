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
