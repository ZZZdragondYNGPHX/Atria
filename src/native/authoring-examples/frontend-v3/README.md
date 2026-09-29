# Native Frontend v3 authoring — Phases 2–3

`frontend.json` identifies Views, Components, global styles and exact assets.
Each `.aui` file contains one `<template>`, optional JSON `<contract>` and optional
component-scoped `<style>`. Every element has a stable `node-id`.

Build and Studio Preview use the same compiler. Play and Preview use the same
renderer and consume compiled artifacts only. A View root is loaded when mounted;
component/style/asset bytes are hash-checked and cached within the Experience.

## Presentation contract

```html
<template>
  <section node-id="panel">
    <button node-id="increment" on:click="increment">Increment</button>
    <output node-id="count" bind:text="component.count" />
  </section>
</template>
<contract>{
  "state": {
    "component": {
      "schema": {
        "type": "object",
        "properties": { "count": { "type": "integer" } },
        "required": ["count"],
        "additionalProperties": false
      },
      "initial": { "count": 0 }
    }
  },
  "interactions": {
    "increment": [{
      "kind": "set", "target": "component.count",
      "value": { "op": "add", "args": [{ "get": "component.count" }, 1] }
    }]
  },
  "nodeRefs": ["increment"]
}</contract>
<style>
  section { display: flex; align-items: center; gap: 1rem; }
  button:focus-visible { outline: 2px solid currentColor; }
</style>
```

- State scopes: `component` per instance, `view` per route-history entry,
  `ui` and `draft` per mounted Experience, `prefs` via existing Host account
  preferences. Declare closed schemas and initial values. Shared declarations
  must agree. Presentation state never writes World/Session authority.
- `props` entries contain `schema` and optional `default`; `emits` maps event
  names to schemas; `slots` lists accepted slot names (`default` included).
  `<component node-id="card" ref="Card" prop:title="ui.title"
  on:changed="receive">…</component>` uses props down/events up.
  Named supplied children use `slot="name"`; outlets use
  `<slot node-id="outlet" slot-name="name" />`.
- `bind:text/value/checked/disabled/hidden/class/title/aria-label` take a typed
  scope path. Value/checked on form controls are writable local models.
  `if="ui.visible"` controls visibility. `form.dirty`, `form.touched`,
  `form.errors` and `form.busy` are read-only local projections.
- Interactions support `set`, `toggle`, `emit`, `focus`, `view.push`,
  `view.replace`, `view.back`, `overlay.open`, `overlay.close`. Targets are
  declared state paths, emits, NodeRefs or View IDs. No arbitrary evaluation.
  Expressions are literals, `{get:path}` or bounded `{op,args}` operations.
- Lifecycle maps `mount`, `activate`, `deactivate`, `unmount`, `propsChanged`
  to interaction IDs. Routing from lifecycle is rejected to prevent recursive
  mounts. Route history is bounded to 64, overlays to 8.
- Keyed lists use `each="ui.items" item-key="id"`. Lists over 512 items need
  `window-size="12" row-height="32"`; schemas can bound arrays to 10000 items.
  Visible row geometry is fixed-height. Keys are unique strings/numbers.
  NodeRefs must identify non-repeated nodes; repeated child Components retain
  their own separate instance identities.
- `dynamicStyles` declares typed sinks (`property`, `type`, optional closed
  `tokens`). `style:name="ui.value"` writes only that declared sink. Raw inline
  style strings are rejected. Static CSS supports Grid/Flex, variables/layers,
  media/container queries, pseudo-elements, animation/transforms and filters.
- CSS resources use `url(resource:assetId)`; fonts use `@font-face` with exact
  WOFF2/WOFF/TTF/OTF assets. Families are rewritten into Experience-scoped Host
  FontFace registrations. Imports, external URLs, local-font probes, executable
  and unresolved resource functions fail closed.
- `env` exposes frame/viewport dimensions, orientation, mobile/desktop, pointer,
  hover, dark, forced-colors and reduced-motion projections. Numeric values and
  safe-area insets are also projected as `--atria-*` CSS variables.

Components have isolated ShadowRoots inside a Host-owned clipping boundary.
Package CSS cannot style that outer boundary or the Full Host System Layer.
Overlays remain inside the assigned surface; no Package dialog/popover browser
top-layer API is exposed. Focus trap/restore and Escape coordinate with Host
controls. Host-facing NodeRef handles expose only bounded local measurements,
observers and pointer capture; they never return DOM nodes. The frame scheduler
is local presentation timing and cancels work on disposal.

The executable `tests/native/helpers/frontend-presentation-fixture.js` and
`tests/frontend/native-frontend-v3.smoke.mjs` cover composition, forms, fonts,
state, routing, overlays, NodeRefs, responsive modes and virtualization.

## Host Bridge v1 — Phase 3

The Source Index's `bridge` field names a JSON file with `version: 1` and a
`bindings` array. Build pins the typed target contract/schema digests, safe input
mapping, source adapter, requirements and receipt/idempotency policies. Installed
validation recomputes these from the actual Experience contract; neither Play nor
Preview accepts caller-supplied target selectors or descriptors.

Bindings have `id`, `kind`, `target`, `inputSchema` and `outputSchema`:

- **Snapshot Read**: `kind: "read"`, targeting `{resourceId}` from declared Package
  Data or `{domainId}` from the existing Application projection. Data resources
  use their public JSON schema. Application snapshots have the closed schema
  `array<{id: string(maxLength:64), value: domain.recordSchema}>`, with
  `maxItems: 10000`. Snapshot input is the closed empty object schema.
- **Collection Read**: add `collection: {pageSize, orderBy, filters, search}`.
  `outputSchema` is the item schema; `inputSchema` is a closed object of allowed
  equality filters and optional `search` string. `pageSize` is 1–256. Ordering is
  ascending on a unique scalar item field. Search is bounded literal substring
  matching over declared string fields, never regex/SQL. The two source adapters
  are `package-data@1` and `application@1`; no raw database query adapter exists.
- **Action**: `kind: "action"`, targeting `{domainId, commandId, recordId}`.
  `recordId` is fixed by the binding (defaults to `domainId`). The target is an
  existing typed Application command through `SessionCore`; commands are void,
  so the successful public data payload is `{}`. The result is an actual Bridge
  Receipt, not a full authority snapshot. Read projections carry state changes.
- **Operation**: `kind: "operation"`, targeting `{taskId, variantId}`. The variant
  may be omitted only for a single-variant Task. Public output is exactly that
  variant's typed `outputSchema`; input is the Task schema or a safe mapped schema.
  Host-owned saved Task slot bindings select the execution route. The existing
  Generation Host/Task scheduler owns providers, secrets, retries, cancellation,
  backpressure and authority finalization. Tasks requiring Lifecycle intent still
  require it; a frontend binding never bypasses that target's own checks.

Every schema is closed/bounded under the existing data-schema validator. In
particular, strings require `maxLength`, arrays require `maxItems`.

### Safe input mapping and declarative calls

Input mapping defaults to `"identity"` and requires the same target input schema.
An object mapping may construct target arguments from public input paths and
schema-checked constants only:

```json
{
  "id": "saveNote",
  "kind": "action",
  "target": {"domainId": "notes", "commandId": "save", "recordId": "main"},
  "inputSchema": {
    "type": "object", "properties": {"label": {"type": "string", "maxLength": 256}},
    "required": ["label"], "additionalProperties": false
  },
  "outputSchema": {"type": "object", "properties": {}, "additionalProperties": false},
  "mapping": {"fields": {"text": {"input": "label"}}}
}
```

A Component interaction can invoke it with local state:

```json
{
  "save": [{
    "kind": "action.invoke", "target": "saveNote",
    "value": {"object": {"label": {"get": "draft.note"}}}
  }]
}
```

Supported bridge interactions: `read.snapshot`, `read.page`, `action.invoke`,
`operation.start`, `operation.cancel`. A page interaction can pass
`cursor: {get: "bridge.items.cursor"}`; cancellation passes
`operationId: {get: "bridge.job.operationId"}`. Input objects use `{object:{...}}`;
there is no arbitrary expression evaluation.

`read="bindingId"` is snapshot shorthand with a scoped subscription. `action`
node shorthand invokes an empty public input; typed inputs use interactions.
Results live in the read-only `bridge.<bindingId>` projection, including `status`,
`data`, `cursor`, `operationId` and `error.code`. Namespaced binding IDs use the
longest declared identity. Collection-backed lists render empty while no page is
available; the receipt still distinguishes loading/error/empty states.

Compiler inference adds declarative calls to the Component's `uses`. A child does
not inherit its parent's handles. The Host-only `createFrontendBridge().scope()`
API is the single compiled semantic layer for both declarative callers and future
Script integration; no Script VM is implemented in this phase.

### Receipts, revisions and Epoch

All transport responses use `version: 1`, `ok`, `bindingId`, `epoch`, `revision`,
`schemaDigest`, `status`, `data`, `cursor`, `operationId`, `error`. Errors expose a
stable `bridge_*` code and retryability, never raw Host/provider exceptions.
Operation status is queued/running/progress/completed/failed/cancelled; provisional
provider content is not treated as committed data. Only a validated completed
Task payload enters `data`.

Each write requires a revision and an idempotency key. Keys are scoped to the
Experience Epoch and binding; reusing a key with different input/method/revision
fails. Duplicate concurrent starts share the same operation. Existing typed
Host receipts remain the durable authority; the Bridge only caches transient
receipts and never retries/rebases an authority write automatically.

Collection cursors are opaque Host tokens bound to binding, query, revision,
ordering and Epoch. Changed queries/revisions, forged cursors, undeclared bindings
and wrong Component scopes fail closed. Read subscriptions and operation status
use bounded polling of the formal Host projection; no new event/authority store.

Epoch is independent of local route navigation. Branch publication, restore
(including a no-op restore), presentation reload and disposal revoke handles,
cursors and async work. Late responses never update the new frontend. Already
accepted short authority transactions are not rolled back by presentation
cancellation; the new Epoch must reread committed projections. Reload remounts
Views/Components and resets UI/Draft state, while declared Prefs reload through
the existing Host account preference adapter. `scope.fixed.prefs()` and
`scope.fixed.environment()` return copies of the existing fixed projections,
never storage objects, browser globals or Host services.

Transient limits: 128 open Experiences per service, 30-minute token lifetime,
256 write receipt keys, 512 cursor tokens and 64 operations per Experience;
64 read subscriptions/operation observers per Component. Exhaustion fails closed.
A process restart invalidates transient tokens instead of trying to migrate them.

### Play, Preview and validation fixtures

Play opens the owner-checked installed graph over `/api/native/session/frontend/`.
Studio Preview supplies immutable owner-checked read projections through the same
compiled client/schema/query layer. Preview Application collections begin empty;
Package Data reads use exact Preview assets. Preview writes return
`bridge_preview_readonly`—there is no simulated authority or legacy fallback.

`tests/native/helpers/frontend-bridge-fixture.js`, the two `frontend-bridge*`
unit suites and `tests/frontend/native-frontend-bridge.smoke.mjs` demonstrate typed
inputs, snapshot subscriptions, pagination, scope/revision/epoch errors, real
SessionCore Action publication, Operation lifecycle, recovery and Preview parity.

Conversation/Session/Prose expansion, Remote Media, Localization/IME, Script VM,
Canvas and the Studio visual editor remain in their scheduled later phases.
