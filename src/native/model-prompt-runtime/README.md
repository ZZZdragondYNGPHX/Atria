# Native Model / Prompt / Runtime — integrated contract (P8)

This is the current API/composition reference. Phase-by-phase implementation and
validation history lives on `docs:planning/atria-model-prompt-settings/`. The
first-party product uses this pipeline now; it is not a future P2/P3 proposal.

## Authority and composition

`NativeGenerationHost` composes authenticated Session/Studio context,
`NativeModelPromptPersistence`, the P1 `VersionedJsonResourceHandler`,
`RouteResolver`, `PromptCompiler`, `GenerationService`, an explicit HTTP Provider
Port and the existing Secret Store adapter. Core imports no browser/SillyTavern
settings, presets, DOM, sender globals or persistent prompt state.

- Connection/Model/Runtime Route: stable player-owned Native IDs in existing Store.
- Generation Profile/Prompt Module/Prompt Program: immutable exact revisions in
  Library, Project source or installed Package. No name lookup or latest fallback.
- Request Context Plan/Prompt IR/Effective Request Snapshot: immutable request-owned
  values, not another storage layer. Provider/config reads are snapshotted for a
  request; concurrent edits cannot rewrite its accepted evidence.
- Project writes: A1 Workspace/ChangeSet, human Review/Apply. A8 AI edits retain
  tool projection, pinned base revision, Review/Commit/Takeover. Package originals
  are read-only. Fork creates independent resources; no predecessor-key fallback.

`RouteResolver({ persistence, library, providers, getScopedResource?,
getSessionRoute? })` is read-through. Scoped ports must return `{ snapshot,
origin }` matching every requested owner/ID/revision. Core supports a Session-route
port, but the current HTTP host provisions **player routes only**. An explicit
Session-scoped route is rejected, never reinterpreted as a player route.

`GenerationService({ resolver, contextProvider, preparePrompt, secretPort,
providerFor?, now? })` accepts request-owned input; `preparePrompt` is supplied by
`PromptCompiler`. No compile/resolve/send path provisions a resource or writes
config. UI save paths are separate authenticated P1/A1 operations.

## Authenticated HTTP API

Prefix: `/api/native/generation`. Existing authentication/CSRF controls apply;
the owner is `request.user.profile.handle`, never a submitted `handle`.

| Method / path | Contract |
| --- | --- |
| GET `/configuration` | Player `connections`, `models`, `routes`, current Generation `profiles`, and Library resource revision summaries. |
| PUT `/configuration/connections` | Save validated player Connection; exact Secret ID, never its value. |
| PUT `/configuration/models` | Save Model with stable Connection ref. |
| PUT `/configuration/routes` | Save player Route with exact Prompt/Generation refs and bounded, same-role, acyclic fallback graph. Library closure validated before save; Project/Package owner checked in context at preview/execute. |
| PUT `/configuration/profiles` | Commit immutable Library Generation revision; existing routes stay pinned. |
| GET `/resources` | Read-through exact Library revisions, current Project source resources, installed Package contents. |
| POST `/resources` | `{ resourceType, resource }` commits a Library Prompt/Generation revision via P1; no Package/Project mutation. |
| POST `/preview` | Compile/render/budget validation only; no Secret resolve, send, or persistence. |
| POST `/execute` | Execute exact request; JSON response or SSE with `Accept: text/event-stream`. |

Preview/execute request fields:

- `requestId`: caller's request identity; `role`: `narrator`, `intent_resolver`,
  `event_interpreter`, `orchestrator`, `studio`, `memory` or `search`.
- Exactly one context: `{ sessionId, revisionId }` or `{ projectId, revision }`.
  Optional `taskId` pins an A8 Task in the Project context. Stale revisions and
  review/blocked/conflict/taken-over/completed Tasks fail before send.
- Optional `routeRef: { scope: "player", runtimeRouteId }`. Additional scope/owner
  fields are rejected. Without a ref, there must be one primary matching-role
  route (fallback-only routes do not count as primaries). Missing/ambiguous routes
  require explicit configuration; no implicit legacy/global route is chosen.
- `messages`, `tools`, `outputContract`: supplemental task/tool dialogue and output
  authority. Native selected facts/history remain owned by the context adapter.
- `prompt`: typed `parameters`, request `locals`, checked `artifacts`, `stageIds`.
  Caller-supplied `prompt.host` is rejected.
  Effective parameters use authored defaults, then the resolved player's Runtime
  Route `promptParameters`, then explicit request parameters. Every fallback uses
  its own route choices and exact Program definitions; unknown names, wrong types
  and values outside declared choices fail closed before send.
- `fallbackMode`: `disabled` (default), `automatic`, or `confirm`.
  `unknownCapabilityOverrides` permit explicit unknown evidence only, not unsupported.
- `/preview` only: `previewRefs.promptProgramRef` / `generationProfileRef`.
  They must resolve exactly in the committed context, never an unsaved draft.
  Execute rejects preview overrides; request JSON cannot turn execute into preview.

A normal result contains `{ snapshot, response, routing }`; preview also supplies
`preview: true` and `rendered` instead of sending. `routing` carries `fallbackUsed`
and attempts `{ runtimeRouteId, retry, status }`; preview attempts are empty.
SSE emits `data: {"chunk": ...}`, then `data: {"result": ...}` or a sanitized
machine-code error. Disconnect/Stop cancels the underlying provider request.

Errors remain `native_generation_*` / `generation_*`, with 409 for revision
conflicts, 400 for rejected input/configuration/runtime failures and 401 without
an authenticated owner. Unknown internal exceptions are not returned verbatim.
`native_generation_route_ref_invalid` rejects scope ambiguity;
`native_generation_context_ambiguous` rejects conflicting Session/Project input.
No error handler catches a Native failure and retries through a legacy sender.

## Compiler and context semantics

Prompt Modules target semantic positions (foundation/character/world/style/response,
agent task/evidence/constraints, before/after history/input, response prefill/post
history). Programs order stages and exact module refs. Stage order is canonical;
within a stage target, priority and stable module ID provide deterministic ordering.
Conditions are finite validated data, never executable JavaScript/ST macros.

### Player Prompt controls (NPC-001)

Parameter definitions optionally declare `label`, `description`, and `options`
(`[{ value, label }]`, 1–128 distinct string or finite-number values matching the
parameter type). Boolean parameters render as checkboxes; finite options render
as single-selection controls and must declare a default or be required.
Author labels/values are data, never locale keys.
Defaults and control definitions remain immutable Prompt authoring data.

Play's **Prompt choices** inspector and Runtime Diagnostics edit overrides owned
by the selected player Runtime Route, shared across its sessions and reloads.
They do not choose a new execution route or write Session/Package/Program state.
Unchecking **Override default** removes that override on save; **Restore Prompt
defaults** persists an empty override map. Required values without defaults still
need an explicit selection before generation. Changing an exact Program reference
does not silently discard stale overrides; the UI diagnoses them and compilation
rejects them until corrected or reset. Request-owned overrides remain supported.

Authenticated GET/PUT `/prompt-controls/:runtimeRouteId` read exact inherited
definitions through existing Library/Project/Package readers. PUT accepts
`{ expected: <loaded route>, parameters: <partial overrides> }`, validates values,
and performs a serialized compare-and-update of only the existing mutable route.
Concurrent edits require reopening controls; no extra persistence authority or
Prompt revision is created. The general route configuration API remains unchanged.

`snapshot.promptIr.compilation` records effective parameters, selected stages and
included/disabled/condition-false module decisions for the same compiler used by
preview and execution. Generic parameter errors are safe machine codes with
localized product remediation; invalid values cannot trigger a fallback send.

`PromptCompiler({ hostDefinitions })` accepts `{ request, resolved, contextPlan }`.
Parameters, request locals, module parameters and prior-stage artifacts use typed,
scoped declarations. Artifact producers must precede consumers and declarations/
conditions cannot escape their scopes. Persistent game state remains in Session
State/Revision, not local Prompt variables. Projections do not create a second
Orchestrator or reorder producer/consumer stages.

Host-owned read-only string fields: `host.role`, `sourceKind`, `sessionId`,
`branchId`, `revisionId`, `projectId`, `projectRevision` (irrelevant IDs are empty).
Task dialogue is supplemental; a tool-result round does not append an empty user
message or duplicate the current input after the transcript.

Derive supports add/disable/replace/configure over exact ancestors. Cycles, duplicate
module identities, inconsistent stages, conflicting definitions and invalid typed
configuration fail closed. Exclusive targets and response directives are validated.

Budget validation counts the final rendered request, including tools/output
contracts, using the Model tokenizer. Input + reserved output must fit the Model
context limit. The same context/compiler/provider counting runs on preview and on
every fallback route. Unsupported tokenizers or controls fail, not silently degrade.

## Providers, Secret and fallback

Production HTTP adapters: `provider.openai-compatible` (chat-completion messages)
and `provider.raw-text` (text completions). Endpoints are explicit URLs; embedded
URL credentials, query strings and fragments are rejected. Redirects are disabled.
Bearer authentication uses an already provisioned exact Secret ID. This feature
adds no credential importer/provisioner or external provider account setup.

Implemented controls: sampling temperature/topP, output maxTokens, stop sequences,
streaming enabled, toolChoice value. OpenAI-compatible additionally carries tools
and JSON-schema output. Raw text rejects tools/structured output. Tokenizers are
`cl100k_base` / `o200k_base`. Reasoning/cache/provider extensions, custom network
options, unsupported hints/message formats and other provider families fail closed.
Anthropic/Gemini protocol render fixtures are not production transports.

Capability decisions retain supported/unsupported/unknown plus provenance. Explicit
unsupported wins over supported evidence. Unknown required capability needs an
explicit override; unknown is not rewritten as provider support.

Only the send boundary receives a Secret value. Snapshots/config/debug evidence
contain no credential value. Core withholds credential-prefix stream tails and
rejects a credential echoed in output/config. Native Play publishes accepted
assistant content only through the existing Draft/Revision lifecycle; Stop never
publishes a late or uncommitted response.

The host owns same-route retries (`maxRetries`) inside that route's send timeout.
Core owns complete-route fallback (`maxFallbackAttempts`), recompiling/recounting
with the fallback's own model/connection/exact resources. Only typed transient
send transport/provider/timeout failures permit fallback. Configuration, Secret,
parser/output/application errors and cancellation do not. Tools/output contract
and inherited requirements must survive fallback unchanged. Confirm mode reports
`generation_fallback_confirmation_required`; resubmission is an explicit decision.

## Package closure and product boundaries

Package build resolves the exact resource closure through existing Library/Project
services and projects it to Package ownership. Derived Programs flatten/freeze
into standalone stages and typed configured module defaults. Logical IDs preserve
ordering/replacement aliases. Ordinary Program refs stay exact. Build-time
structural freezing may defer required bindings in ancestor templates; runtime
compilation always validates selected bindings. Offline installed Packages never
consult Library current revisions. Package/Project/Library Used By is owner-scoped
and derived read-only from canonical authorities.

Library owns Prompt/Generation discovery and Fork/Derive; Build owns A1-reviewed
Project authoring. Runtime owns player Models/Connections/Routes. Settings contains
allowlisted preferences only. Search routes to exact owning Library resources or
Runtime editors and refreshes when Command opens. Missing revisions do not follow
latest. Localized UI chrome never translates saved IDs/names/JSON.

The sole first-party legacy sender facade is `public/scripts/native/generation-compat.js`.
It permits legacy dispatch only without a Native Session, without an explicit
Native source and outside mounted Native Shell. Empty Native Shell must fail for
missing context, not silently invoke ST. Explicit non-Native host/recovery and
third-party compatibility retain their existing behavior. `package.presets`, old
names and compatibility UI never become Native runtime authority. Navigation-only
old section redirects do not resolve resources and can remain host conveniences.

## Validation / maintenance

`node scripts/check-p8-model-prompt-integration.mjs` runs P0-P7, A0-A9, N9/N10 plus
final no-write/exact-read/Native-fallback checks. Earlier N0-N8 invariants are covered
by applicable Native contract/Session/Context/Save/Package tests and N9/N10 guards;
there are no separate N0-N8 guard scripts in this repository. The permanent
`.github/workflows/model-prompt-runtime.yml` runs on main/PRs and replaces temporary
phase-only workflows. Runtime/resource HTTP tests, poisoned-legacy/concurrency/
Secret/fallback tests, offline Package tests and real-host desktop/mobile browser
cases accompany the guards. Historical completed evidence and exclusions remain
on the docs branch, not in stale API promises.
