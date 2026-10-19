# Native Model / Prompt / Runtime — integrated contract (P8)

## Prompt / Behavior backend extension

The following contracts extend the original pipeline. They do not establish a
second compiler, resource store, evaluation source registry or orchestration Host.

### Authored text and semantic trust

Prompt Modules may declare `textMode: "literal" | "template"`. Omission keeps
the existing Native template syntax. Literal mode preserves the complete body,
including CRLF, Unicode and literal `{{...}}`; it never expands variables. Template
values are not recursively interpolated. Candidate validation and Package freezing
preserve this distinction. Authoring must retain the original resource body even
when the effective request includes substitutions or scope labels.

An optional Module `expression` is `{ layer: "global" | "scene" | "narrator" |
"actor", actorId? }`; only `actor` requires/accepts `actorId`. Expression describes
prose scope and never reorders it. The Provider receives an explicit
style scope label. These fields grant no Actor, Cognition, Source, Tool or World
permissions. Identity and knowledge remain owned by their original authorities.

### Ordered entries and Context anchors

Stage arrays define expansion order. Each stage stores either a compact
`moduleRefs` array or an `entries` array, never both. Entries use stable
`entryId` values independent of the resource ID or revision:

```json
[
  { "entryId": "module.intent", "kind": "module", "moduleRef": "<exact module ref object>" },
  { "entryId": "anchor.material", "kind": "anchor", "target": "context.before_history", "accepts": ["context.fact"], "required": false }
]
```

Module/Anchor order inside each target follows the author's list. Target groups
retain their semantic position. Priority, expression layer and resource ID do not
reorder entries. An Anchor projects the original selected Context items in their
existing order, retaining message roles and provenance; consumed items leave the
automatic insertion path. Conditions, empty optional anchors and required missing
anchors appear in compilation diagnostics. Contributions are request data and
are never saved into a Program.

Exact derive operations select `{stageId, entryId}`. Replace/disable/configure
keep position; add supplies `entry` and a `position` with one of `before`, `after`
or `edge: "start" | "end"`. Relative insertion must use the same target.
Compact module-ID operations require one unambiguous occurrence. Reference
mapping preserves entry IDs when importing or forking; Package freeze keeps
ordered anchors while resolving inherited modules/configuration.

The shared editor exposes prose, literal/template mode, expression scope,
entry movement, Anchor settings and exact insertion controls. JSON and fields
share Undo/Redo; invalid JSON, original unchanged line endings, text selection
and scroll position survive view changes. Library templates create ordinary
editable resources for blank, general, roleplay, writing and agent use.

The original compiler now emits `semanticBlocks` alongside its inspector fields.
Both projections must agree. Blocks identify Host policy, author instructions,
evidence, dialogue, Tool results, input and prefill, preserving original provenance,
source and available epistemic/coverage metadata. Facts and Persona slots lower to
user data; authored context-position modules retain their declared instruction
semantics. Direct system/developer history is rejected. The authenticated Host
treats caller-labelled system/developer task envelopes as evidence, preserving the
raw text without granting a system role. Narrator requests include the strict
player-agency and expression policy; this is guidance, not proof that a model
cannot leak information or invent a player action.

### Trusted Program selection and currentness

Internal callers may use `host.execute(owner, input, signal, onChunk,
{ programSelection: { promptProgramRef, assertCurrent } })`. The reference must
be exact and the callback must be an executable trusted Host authority. It receives
the authenticated owner, original source, candidate Route, selected ref and phase;
compile/send/preview phases also provide the actual `contextPlan` so the original
Host can check the consumer's Audience/Grant against what will really be used.
Request JSON cannot supply this authority. Task variant, illustration, prediction
and browser Draft overrides cannot silently replace their frozen Program through
this option. The scheduler preserves the selection, and includes its exact ref in
request identity. Preview does not save the selected Program onto a Route.

Every fallback resolves its own Model/Connection/Generation, recompiles and counts
again while keeping the selected Program closure, author behavior, parameters,
stages, Tools, Output, network policy and accepted compute policy. Context/Memory
may be selected again within the original source/permissions. A mismatch fails
with `generation_semantic_authority_changed`; it never silently adopts a different
Route Program. Diagnostics distinguish the declared Route ref from the effective
Program ref. V3 must construct this internal selection from its own immutable
Plan/Node pins and original admission, and retain the compiled evidence in its
Attempt/Receipt; this extension does not itself publish or run a V3 Plan.

The Context Provider's optional `assertCurrent` port runs before compilation,
after Secret resolution immediately before sending, and before a preview returns.
The Host rereads original Session/Project/Task state and checks revision, branch,
applicable authority state and Task fingerprint. Its actual HTTP send/retry boundary
checks again. A provisional Authority Turn is compared against its original
committed source, preserving legitimate pending World projections. Full V3
Audience/Disclosure/Join invalidation and long-form quality still require their
original production consumers and evidence.

### Unpublished Draft Preview / Diff

Authenticated `POST /api/native/generation/preview/draft` accepts:

```json
{
  "request": { "requestId": "preview-1", "role": "narrator", "projectId": "<current project>", "revision": "<exact revision>" },
  "drafts": [{ "ref": "<exact resource ref object>", "expectedFingerprint": "<canonical base SHA-256>", "resource": "<complete resource object>" }],
  "baselineDrafts": []
}
```

The strings standing for objects above are documentation placeholders. Supply the
actual exact ref/resource objects. An empty `drafts` array obtains the baseline.
Use `GET /resources` entry `fingerprint` or the baseline's
`authored.resources[].baseFingerprint` as `expectedFingerprint`; it hashes the
original validator-normalized resource, not an arbitrary raw JSON representation.

Supported replacements are Library/current Project Prompt Programs,
Modules and Generation Profiles with unchanged type/ID/revision. Package originals
must first be forked through their existing authoring flow. The original reader
checks owner/origin/exact base before the ephemeral replacement. For a new exact
revision, set `expectedFingerprint:null`; it must not already exist. Dependencies
may include other declared new drafts, with the same original owner checks. Unreferenced replacements,
duplicate refs, stale bases and changed identities fail closed. Limits are 32
replacements, 512 KiB replacement JSON and 1 MiB total request JSON.

Response: `preview:true`, `publication:"unpublished"`, `sent:false`,
`baseline`/`candidate` with `identity`, `authored`, `effective` and `wire`, plus
`diff` with `sameSource`, `identityFingerprint` and JSON Pointer changes in each
layer. Authored resources retain full bodies; effective contains the actual IR,
count/budget, compilation and binding; wire is the adapter's public request body
without credentials or opaque reasoning/continuation state. `baseFingerprint` and
`resourceFingerprint` distinguish the committed base from a replacement. Diff
compiles each side once, captures shared Context/Runtime configuration and then
rechecks the original source. Optional `baselineRefs` and `candidateRefs` select
exact `promptProgramRef`/`generationProfileRef` independently for each side. No Secret resolution, Provider send,
resource write, publication or new persistence occurs.

Handle `native_generation_draft_conflict` / `...draft_source_conflict` by retaining
the draft and refreshing the exact base/source. `...draft_unreferenced`,
`...draft_identity`, `...draft_owner` and `...draft_fingerprint_required` require
repairing input. A successful preview is neither publication nor execution.
Production execute/task/turn/start routes reject browser Draft/Program authority
fields rather than ignoring them and accidentally sending a request.

### Browser disclosure and truthful blocked states

Model context access does not grant browser Inspector access. Session previews
with Information Runtime require a separately proven complete player-display
projection. Context-only/private fields, Actor/Task audiences, incomplete grants,
extra Knowledge/Memory/derivation/processing/expression channels without a complete
display proof return `native_generation_preview_disclosure_denied`. Public-only
Information projections and ordinary authorized Project/Session previews remain
supported. The guard does not replace private content and label a different body
as the actual wire.

For execute JSON/SSE results and retained operation result reads, an unprovable
private/stale Session snapshot yields a successful response with
`projection:"restricted"`, `reason:"native_generation_preview_disclosure_denied"`
and `snapshotSummary` (refs and input count), without `snapshot`, private IR or
raw diagnostic hashes. This must not be rendered as a failed generation or an
empty complete Inspector. Legitimate model execution is unchanged. Model prose
and provisional streaming are still subject to the original output/disclosure
contracts; this change does not claim deterministic natural-language leak detection.

`GET /api/native/generation/quality-profiles` is authenticated, read-only and
`private, no-store`. It returns original non-legacy profiles, exact revisions,
dimensions, critical dimensions, source requirements, provenance levels and true
readiness. New profiles are `rp.narrative`, `project.agent` and
`rp.creative_refusal`. Registration is not quality acceptance: unavailable reviewed
independent sources remain `BLOCKED / source_unready`. Model opinions remain
unverified hypotheses, never Host verification or Provider protocol evidence.

`generation_provider_content_blocked` reports a supported adapter's explicit
protocol refusal/filter signal, including supported SSE signals. It preserves
observed usage and is not retry/fallback eligible. Apologetic prose, unknown reasons
and generic truncation are not automatically classified as explicit refusal.

Plan-prompt evolution still requires original V3 immutable PlanRevision,
PlanBinding CAS, Review, publication journal/reconcile/rollback and real evaluation
sources. An unavailable original consumer must remain blocked; do not implement
a browser publisher or translate retired Workspace/Director settings into V3.

This is the current API/composition reference. The
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
| PUT `/configuration/models` | Save Model with stable Connection ref. |
| PUT `/configuration/routes` | Save player Route with exact Prompt/Generation refs and bounded, same-role, acyclic fallback graph.|
| PUT `/configuration/profiles` | Commit immutable Library Generation revision; existing routes stay pinned. |
| GET `/resources` | Read-through exact Library revisions, current Project source resources, installed Package contents. |
| POST `/resources` | `{ resourceType, resource }` commits a Library Prompt/Generation revision via P1; no Package/Project mutation. |
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
- Caller-supplied `prompt.host` is rejected.
  Effective parameters use authored defaults, then the resolved player's Runtime
  Route `promptParameters`, then explicit request parameters.
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
definitions through existing Library/Project/Package readers.
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

Derive supports add/disable/replace/configure over exact ancestors.

 Input + reserved output must fit the Model
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
`cl100k_base` / `o200k_base`.
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
ordering/replacement aliases. Ordinary Program refs stay exact. Offline installed Packages never
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

## Native Regex ownership

The shared Regex engine applies Global → Preset → Game; each layer receives the
previous layer's result. Registered plugin providers run afterward. Placement,
display/prompt/plugin lanes, depth, enablement and execution diagnostics still
use the existing engine. Regex does not own World state or Game Runtime behavior.

Global rules and account enabled-rule groups remain in capability settings.
Prompt Preset `regexScripts` lives on its existing Library main-program root,
beside membership and taxonomy. Preset import/export includes the full program,
modules, generation profile and rules. The active chat preset is resolved through
the existing primary narrator Runtime route; no extra selected-preset setting is
stored. Exact Prompt references remain exact, while rules follow their owning
preset's current metadata. Deleting a preset clears ownership and Regex, archives
its roots, and retains immutable Prompt definitions for pinned consumers.

Game rules live in Package `processors.regex`. Existing related
Sessions capture explicit edits in revisioned `atri_game_regex` state; effective
`manifest.processors.regex` projects that snapshot. Historical Session revisions
stay exact; portable saves carry effective rules, and package exports carry rules
in the actual archive. Normal package upgrades do not silently upgrade Sessions.

Rule IDs are local to their owner. Execution diagnostics and editor selection
include scope/owner identity. Duplicate IDs inside one imported owner are rejected;
standalone rule imports mint fresh IDs, while repeated preset imports mint new
preset resource identities. Missing IDs in earlier Native Packages receive stable
local IDs. No Character/Card storage, legacy Prompt Manager or DOM provider is
restored.

# S08 Prompt candidates

`PromptCandidateStore({ engine })` reuses the Library immutable revisions and the
Preset root.
Use the existing `/presets/:id` export to obtain the exact module refs and current
revision. `declare` accepts `{ expectedRevision, moduleRefs }`; an empty list
revokes pending candidates.
Apply switches only that Route's exact Program ref, retains its exact Generation
ref and rejects any Preset/declaration/Route drift. Repeating the same complete
desired binding returns `alreadyApplied`. Missing revisions fail without a
current-version fallback. Package definitions require an explicit imported
Library Preset copy first. Manual editing does not confer evaluation eligibility.

Ordinary RP uses the original Workspace settings library and its scoped bindings.
The orchestrator API exposes `inspectPromptVersions()`,
`checkPromptCandidate(candidateId)` and `updatePromptVersions(action)`:

```js
// Start from a user copy and a character/conversation binding to that copy.
{ type: 'declare', presetId, expectedPreset, agentIds: ['owner'] }
{ type: 'prepare', presetId, agentId: 'owner', body, scope: 'conversation',
  subjectId: chatId, expectedBindings }
{ type: 'apply', candidateId }
```

The complete normalized `expectedPreset` and current `expectedBindings` are
available in the existing Workspace settings. The selected
profile/Plan carries `promptVersionId`; the next preparation reads that exact
definition. An existing run keeps its cloned profile. An ordinary `setPresetBinding`
clears the pin. Factory definitions and global/default evolution are rejected.
These operations retain the existing settings save behavior and single-client
support boundary; they do not provide a cross-tab/server publication transaction.

Native candidates: at most 16 per Preset, metadata ≤2 MiB. Workspace candidates:
at most 16 per owner library, complete definitions/metadata ≤2 MiB. Each changed
body is ≤64 KiB; Workspace candidate instructions must be nonempty. Preset edit/deletion or
declaration changes block pending activation; existing exact definitions follow
their original history/backup lifecycle. Automatic jobs, promotion and rollback
remain S10 work.

```sh
node --experimental-vm-modules tests/node_modules/jest/bin/jest.js --config tests/jest.config.json --runInBand tests/native/prompt-candidates.test.js tests/agent-runtime/workspace-prompt-versions.test.js
```

# S09 orchestration strategy candidates

Ordinary RP retains the Workspace settings authority. The orchestrator API exposes
`inspectStrategyVersions()`, `checkStrategyCandidate(candidateId)` and
`updateStrategyVersions(action)`. Explicit declarations select existing bounded
integer fields on user copies: `budgets.maxSteps` for Loop/Director (1–64),
`budgets.maxConcurrency` for Spec/Director/Agenda (1–16), or Agenda
`scheduler.maxPlannerRounds` (1–32) / `scheduler.maxTotalRuns` (1–64).

```js
{ type: 'declare', presetId, expectedPreset, allowedFields: ['budgets.maxSteps'] }
{ type: 'prepare', presetId, field: 'budgets.maxSteps', value: 4,
  scope: 'conversation', subjectId: chatId, expectedBindings }
{ type: 'apply', candidateId }
{ type: 'rollback', candidateId }
```

One candidate changes one field. The scoped binding
selects `strategyVersionId`; the next original compiler/profile/Plan consumes the
exact definition. Current runs keep their accepted clone. Prompt and strategy pins
cannot be combined without a new evaluation; prepare requires an unpinned local
binding.
Rollback compares the complete desired/base bindings and the unchanged Preset;
it remains available after declaration revocation, but rejects later user edits.
Preset deletion clears metadata/pins; ordinary binding selection clears either pin.
There are at most 64 declarations / 16 candidates, total metadata ≤2 MiB. Existing
single-client/debounced settings persistence applies; this is explicit editing.

Project uses the original durable Task parameter `maxRepairRounds`, within the
current server cap. `POST /api/native/studio/projects/:projectId/agent/tasks/:taskId/strategy-candidates`
accepts these actions:

Use the current Task sequence returned by the original Task API. A Task must still
be planning, with no plan, generation attempt, proposal or Workspace. Old Tasks without metadata remain
valid. At most 16 candidates / 1 MiB strategy metadata, within the original 2 MiB
Task limit. Context policy and Task snapshot expose `strategyVersionId` after apply;
the original server repair policy consumes `maxRepairRounds`. Once execution starts,
apply/rollback is refused. Other Tasks retain their own creation parameters; there
is no Project-wide default or automatic inheritance. An empty declaration revokes
pending apply; pristine-task rollback still restores the frozen base. Task deletion
and StorageEngine user backup/restore include the metadata. No candidate tools are exposed to the Agent model.

Manual apply does not confer evaluation eligibility. S10 still owns feedback/policy
dependencies, shared budgets, Review, automatic promotion and runtime monitoring.

```sh
node --experimental-vm-modules tests/node_modules/jest/bin/jest.js --config tests/jest.config.json --runInBand tests/agent-runtime/workspace-strategy-versions.test.js tests/agent-intelligence/project-strategy.test.js
```

### Independent author samples

Use `request.sample:{input,materials,persona,history}` for an author-owned sample;
`history` contains user/assistant text messages. No Session/Project is created.
`request.prompt.parameters` supplies normal Program parameters. Studio may set
`request.resourceProjectId` to read its original Project resources while retaining
the sample Context. The shared editor exposes this same sample and three-layer
revision preview in Library and Studio.

Authenticated `POST /api/native/generation/authoring/try` accepts
`{request,refs,drafts,limits,send:true}`. `refs` has the same two exact selection
fields as preview. Explicit Compute `limits` apply to this request through the
original Scheduler/Host/Provider. This action sends; preview never does. The
result contains the sample response and current-request Compute usage, or a failed
trial with its actual unknown/settled attempts. It does not publish, save a preset,
or apply output to a game. Currency cost remains unavailable without original
pricing evidence. The UI keeps sample data and results during editor view changes.
