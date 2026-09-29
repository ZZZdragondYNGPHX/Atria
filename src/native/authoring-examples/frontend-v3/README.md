# Native Frontend v3 authoring — Phases 2–7

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

The following section adds Phase 4 Conversation/Session/Prose. Phase 5 below adds Media, Localization/IME and Boundaries. Script VM, Canvas
and Studio visual editing remain later phases.

## Phase 4 — Conversation, Session and Safe Prose

Fixed services are closed Bridge targets, not a global Host object. Declare a
normal binding with `target: { service: "host.conversation", method: "messages" }`.
The Host-owned catalogue and exact public schemas are exported by
`public/shared/native-frontend-host.js` (`fixedHostTarget`). Input/output schemas
must match that target; compiler inference still supplies Component `uses`.
No target name is interpreted as an arbitrary service method or database query.

| Service | Read methods | Action methods |
| --- | --- | --- |
| `host.composer` | `get` | `set`, `append`, `clear`, `focus`, `submit` |
| `host.conversation` | `messages`, `status`, `branches`, `alternatives`, `inspect`, `generation`, `blocks` | `retry`, `regenerate`, `fork`, `switch`, `cancel` |
| `host.session` | `status`, `saves`, `diagnostics` | `save`, `restore`, `reload`, `recover`, `exit`, `restart` |

`messages`, `branches`, `alternatives`, `blocks` and `saves` require a Collection
binding. Use `sequence` for message order, `branchId` for branches, `messageId`
for alternatives, `id` for blocks, and `saveId` for saves. Collections retain the
existing page/query budgets and opaque cursors. Cursor identity includes the
source projection as well as revision/query/Epoch, so a SavePoint list change
also invalidates its old cursors. `inspect` takes an exact `revisionId` and reads
committed historical messages without activating that revision. `status` reports
Session/branch/revision/tail IDs, never an authority snapshot.

Example Package-owned conversation (inside a declared Component):

```html
<main node-id="conversation" read="messages">
  <article node-id="message" each="bridge.messages.data" item-key="messageId">
    <p node-id="role" bind:text="item.role" />
    <div node-id="narrative" bind:prose="item.content" />
  </article>
</main>
```

`read="messages"` subscribes to the first page and refreshes on committed revision
changes. Explicit `read.page` interactions supply its opaque cursor for later
pages. A revision change resets subscribed collections to the first page;
packages own page-navigation presentation and selection. No Host message DOM,
legacy message selector, or Swipe object is needed in Full/Hybrid.

`generation` is a separate, bounded ephemeral projection with `state`, `text`,
and a public `error` code. States are idle/preparing/streaming/finalizing/
cancelling/failed. It is never returned as a committed message or included in
message paging. Managed Play consumes the same projection helpers and Composer
contract. Submit and regenerate continue through the existing Native generation
entrypoint/SessionCore/Task scheduler; cancellation uses the existing stop path.
Provider settings, credentials, raw Task streams and authority snapshots are not
exposed. Generation finalization publishes messages through the committed read.

All Actions use the Bridge revision guard and scoped idempotency receipts. Local
Composer/Generation/Session handlers additionally require the installed server
scope's authorization and the active runtime's exact revision. `retry` forks the
current assistant tail back to the coherent post-user boundary; `regenerate`
uses the existing retry-and-generate path. Alternatives are committed assistant
messages sharing a predecessor across branch lineage, not mutable Variants.
Restore, switch, fork, retry, reload and recovery revoke old Experience handles;
late completions cannot populate a replacement View. SavePoint creation captures
the exact guarded immutable revision, including through the Full Host Save action.
`restart` fails with `bridge_policy_denied` unless a Host explicitly configures a
confirmation and restart handler. It never silently resets the Session.

### Safe Prose and Message Blocks

`bind:prose` owns its element's children; do not combine it with `bind:text` or
static children. The shared parser derives an inert AST from canonical text,
with exact source ranges and deterministic mapping validation. Baseline syntax:
paragraphs/blank line breaks, `*emphasis*`, `**strong**`, headings, quotes,
ordered/unordered lists, inline/fenced code, `==semantic marks==`, safe links.
There is no HTML parser or raw AST/DOM injection. HTML-looking input is literal
text. Links invoke Host External Navigation policy, with no package-owned `href`
or direct browser navigation. Budgets: 65536 source characters, 4096 nodes,
bounded inline nesting. Exceeding them fails closed; canonical text is not edited.

Message Blocks remain independent immutable `MessageProjection.flow` entries.
Declare a `blocks` collection target with `blockType`, and an output schema equal
to `fixedHostTarget(target, dataSchema).outputSchema`. Its closed `dataSchema`
is pinned by the compiled graph and rechecked by SessionCore at commit/load.
Unknown types and extra data fields fail closed. Rows expose `id`, `messageId`,
`sequence` (flow position), `type`, `version`, and typed `data`. Package Components
can receive that data as declared props or use it in keyed declarative lists.
No block data is interpreted as Prose, markup, expressions or a command. Any
interactive block action still requires a separately declared typed Bridge target
and its normal revision guard. Managed Play uses inert semantic block cards;
Package Components own custom card presentation. The executable fixture is
`tests/native/helpers/frontend-conversation-fixture.js`.

Reload/recovery recreates presentation state and scopes while preserving Session
Authority. The Host failure panel remains outside Package CSS and offers reload,
plus configured stop/diagnostics/exit actions; a failed recovery retains a Host
panel even after old Views are disposed. Preview shares schemas and rendering,
uses supplied immutable projections, and rejects writes. Missing fixed Preview
projections return `bridge_projection_unavailable`, not a simulated Session.

## Phase 5 — Media, localization, input and boundaries

Source Index `media` and `localization` fields name JSON resources relative to the
index, like `bridge`. The compiler emits exact, hash-checked catalogs and advisory
`diagnostics` resources; install repeats semantic validation. Remote bytes are
never fetched by build or included in `.atria`.

### Media and External Access Permission

```json
{
  "version": 1,
  "required": false,
  "entries": [{
    "mediaId": "portrait.hero",
    "sources": [{"url": "https://images.example/hero.png"}],
    "mediaType": "image/png", "width": 512, "height": 768,
    "loading": "lazy", "cache": "session", "fallback": "portraitFallback"
  }]
}
```

A Package with a catalog must declare both `remote-media@1` in Experience features
and `remote-media` in Package permissions. A required catalog requires both
corresponding declarations to be required. Optional remote media starts denied;
the independent Host panel lists all origins, explains IP/image-selection/timing
exposure, and offers enable/disable. Required catalog consent is checked before
activation. Consent is per Experience and is never controlled by Package state.
Installation consent alone does not silently enable network requests.

`<img node-id="hero" media="portrait.hero" alt="Hero" />` resolves a fixed catalog
entry. Dynamic `bind:media="item.portrait"` accepts a mediaId string or a closed
`{kind:"exact"|"declared"|"host",id}` MediaRef. An URL, extra field or unknown
identity is rejected. `asset="id"` binds exact images, audio or video. Asset MIME
must match the element. Audio/video use native controls and metadata preload;
there is no Package autoplay, raw playback API or remote audio/video capability.
Playback pauses on visibility loss and resources are released on disposal.

Remote sources require canonical HTTPS without credentials/fragments. PNG, JPEG,
WebP, GIF and AVIF are supported. Each entry has at most four candidates and a
mandatory exact image fallback; optional `integrity` is a lowercase SHA-256 hex
hash. Direct browser CORS requests omit credentials/referrer, reject redirects,
and use `cache: no-store`. Origins must support CORS; no server-side raw proxy or
ambient network API is introduced. Host fetch injection is a trusted integration
seam, never Package code. A browser decode failure also uses the exact fallback.
The native image loading hint remains advisory; remote resolution is bounded.

The resolver keeps at most 64 remote entries (2 MiB each), eight in-flight loads
and a 15-second deadline per candidate. It shares pending/session-cache loads,
evicts released entries, and revokes `cache:"none"` entries on release. Denied,
offline, MIME/integrity/size failure and budget exhaustion return safe reason codes
with fallback. Disabled/disposed/recovered Experiences abort requests and revoke
remote object URLs. Exact media retains the existing 2 MiB/resource and 32 MiB
graph budgets. Large catalogs can have 10000 identities within the graph budget.

Only Host code may issue opaque HostIssuedMediaRefs (`runtime.issueMedia`) within
the disclosed origins, with a catalog-backed fallback. Issued references expire
on recovery. Scoped `host.media.resolve` is a closed typed Read returning only
reference/status/reasonCode, never an URL, Blob, DOM node or fetch capability.
For DOM rendering, the renderer alone receives the resolved object URL.

### Package localization and RTL

```json
{
  "version": 1, "defaultLocale": "en",
  "catalogs": {
    "en": {"direction": "ltr", "messages": {
      "greeting": ["Hello ", {"arg": "name", "format": "text"}],
      "count": {"arg": "count", "format": "plural", "cases": {
        "one": "One item", "other": [{"arg":"count","format":"number"}, " items"]
      }}
    }},
    "ar": {"direction": "rtl", "messages": {"greeting": "مرحبا"}}
  }
}
```

`<h1 node-id="greeting" message="greeting" arg:name="ui.name" />` uses a stable
message key and typed interpolation paths. Messages are literal strings, bounded
arrays, or closed formatting tokens, never executable templates/HTML. Formats:
`text`, `plural` (including `=N` cases), `select`, `number`, `date`, `time`,
`relative` (declared unit), `list`. Date/time formatting uses UTC for deterministic
presentation. Locale fallback walks BCP-47 parents then the default; missing
messages use the default catalog, then their visible key with a diagnostic.

`locale.set` takes a locale in its `value`; `announce` takes bounded text. Host
integration also exposes `setLocale`/`announce`, and scoped fixed targets
`host.presentation.locale`, `setLocale`, `announce`. These retain the existing
Bridge scope/schema/revision/idempotency checks. Preview authorizes these pure
presentation targets, without authorizing Session writes. Locale updates `lang`,
`dir` and environment in place, retaining DOM, local state, Composer and Session
Authority. It does not change model generation language or Experience Epoch.

### IME, viewport and accessibility

Controlled values use Composition Lock: ordinary reconciliation waits while an
input composes, preserving the buffer, caret, keyed ancestors and node identity.
Composition end publishes the final typed local value and resumes rendering.
`beforeinput`, `compositionstart/update/end`, `input` and keyboard events expose
bounded `data`, `inputType`, `isComposing`, selectionStart/End. Submit/key actions
are suppressed during composition. Existing safe input attributes remain usable.

Environment adds VisualViewport geometry/scale, safe-area values, bottom
occlusion, keyboard inset, input modality, contrast preference and Host text/UI
scale. Numeric values have matching `--atria-*` CSS variables (scales unitless).
Keyboard inset estimates layout/visual viewport occlusion at scale 1; it is not a
physical keyboard sensor. Host content provides bottom scroll padding and reveals
the focused control when occlusion increases. Packages can use the same variables
for their own fixed composers. Listeners/observers are disposed with the View.

Compiler diagnostics address names/labels, alt text, heading/landmark, role review,
keyboard access, hidden focus, focus styling and reduced-motion fallback.
`runtime.getDiagnostics()` adds rendered touch-target checks. Exact diagnostics
are available to Studio Preview and existing Experience Health; they are advisory
and do not alter authority. The Host-owned local live region serves `announce`.
Existing Overlay FocusScope continues initial focus, trap, restore, inert and
Escape behavior. Full visual editing remains Phase 7.

### Component, View and Root boundaries

Components and media receive local boundaries by default. Other subtrees can use
`boundary="local"`, with `boundary-loading`, `boundary-error`, `boundary-retry`
text attributes. Content remains semantic declarative DOM. `boundary="required"`
also treats media decode failure as a local error. Status is exposed as
`data-boundary-status="loading|content|error"`; fallback includes a retry button.

Resource/style failures, child lifecycle/invocation exceptions, read failures and
local rendering/schema errors remain in the affected boundary. Retry recreates
that subtree and read subscriptions with a new request epoch, preserving sibling
state and suppressing late completion. It never automatically replays an Action
or Operation. Business rejections remain Bridge Receipts. Controller VM failures
use this boundary seam in Phase 6 (documented below).

Root/View load errors retain the independent Host failure/recovery surface. Public
errors contain safe category/reasonCode/retryable/sourceId/diagnosticRef/message,
without transport exceptions or private URLs. Fatal Bridge/preflight/authority
failures retain the existing Host failure path. Boundary/route/media request
revisions are local cancellation tokens and never substitute for Authority Epoch.

Executable coverage: `frontend-platform.test.js`,
`helpers/frontend-platform-fixture.js`, and
`tests/frontend/native-frontend-platform.smoke.mjs`. The browser harness generates
a tiny WebM locally, validates real media decode, and uses deterministic remote
responses plus synthetic composition/viewport events. It does not claim a real
IME, physical soft keyboard, provider or external image-server E2E.

## Phase 6 — Script Sandbox and Canvas

Declare `frontend-script@1` in Experience features. A required Controller requires
a required feature. Script is a capability-isolated feature, not external access
permission. Package source never runs in the browser/Worker's JavaScript realm.

Reference a Controller in the Component's JSON contract; `source` is relative to
the Frontend Source Index, just like other authoring resources:

```json
{
  "controller": { "source": "controllers/map.ts", "required": false },
  "uses": ["people", "save", "images"],
  "nodeRefs": ["map", "animate"]
}
```

Use semantic `<canvas node-id="map" width="360" height="240"
aria-label="Relationship map"></canvas>` in `.aui`. Canvas remains a declarative
node; a Controller cannot create DOM, traverse selectors or obtain a real context.
The installed graph contains `script:<ComponentId>` with exact compiled modules,
static import links, source digests and per-module source maps. The formal Build
transpiles TypeScript to strict ES2020 JS and links package-local, explicit `.js`
or `.ts` static imports. Vendored pure JS algorithms work without npm at runtime.
Source imports are relative to their importing file; cycles, remote/bare/Node
imports, dynamic import, runtime require, eval and dynamic Function are rejected.
This is transpilation/compatibility validation, not a full TS type-checking IDE.
Installation revalidates module syntax and static closure; hashes alone do not
make script artifacts executable. Preview uses exactly these compiled artifacts.

Export a default object with optional `init(ctx, event)`, `event(ctx, event)` and
`update(ctx, event)` handlers. `init` runs once per VM, `update` on changed props.
Declared NodeRefs receive bounded click/pointer/key/input/change events with
`event.node` and `event.type`; composing input/key events are withheld. Events
contain no DOM objects. Nested `ctx.props`, `ctx.state`, `ctx.env` and events are
readonly copies. Each call/async continuation gets current Host presentation
state. Write component fields with `ctx.set('component.count', value)`; schema
validation and reconciliation use the existing state authority. Use declared
`ctx.emit(name, value)` for parent interactions.

```js
import { layout } from './vendor/layout.js';

function draw(ctx) {
    const commands = [['fillStyle', '#edf3e8'], ['fillRect', 0, 0, 360, 240]];
    for (const point of layout(6)) {
        commands.push(['fillStyle', '#356d83'], ['beginPath'],
            ['arc', point.x, point.y, 10, 0, Math.PI * 2, false], ['fill']);
    }
    ctx.canvas('map', { width: 360, height: 240, commands });
}
export default {
    init(ctx) { draw(ctx); },
    async event(ctx, event) {
        if (event.type !== 'click' || event.node !== 'animate') return;
        const frame = await ctx.scheduler.frame();
        if (frame.animation) draw(ctx);
    },
};
```

Controller ABI:

- `ctx.bridge.snapshot/page/invoke/start/operation/cancel` have the same arguments,
  Receipts, revision/idempotency guards and Operation Lifecycle as the existing
  typed Bridge scope. Only the Component's compiled `uses` are callable. Fixed
  Host services use these same declared bindings. Business rejection is a Receipt.
- `await ctx.node(id, 'measure')` returns bounded local geometry. Pointer capture
  and release use `'capturePointer'/'releasePointer'` and an owned pointer ID.
  Direct selectors, mutation and DOM construction are unavailable.
- `await ctx.media(bindingId, ref)` requires a declared `host.media.resolve` Read
  binding. It returns an opaque, VM-generation-scoped image handle, never a URL,
  image object or bytes. Exact/declared/HostIssued refs use the existing resolver
  and remote permission/fallback policy. Pass the handle to an `image` command.
- `await ctx.scheduler.timer(ms)`, `frame()` and `yield()` are bounded Host work.
  Frames use the shared scheduler and return `{time, animation}`; honor
  `animation: false` for hidden/reduced-motion presentation. Timer maximum is 10s.
  `ctx.clock()` and `ctx.random()` are presentation-only, not Game Authority.

Canvas submits one retained batch, coalesced per Host frame. Supported commands:
`clearRect/fillRect/strokeRect`, `beginPath/closePath/moveTo/lineTo/arc`,
`bezierCurveTo/quadraticCurveTo`, `fill/stroke`, `save/restore`,
`translate/scale/rotate/setTransform`, `fillText`, `image` (handle,x,y,width,height),
`fillStyle/strokeStyle` (hex RGBA), `lineWidth`, `globalAlpha`. There is no pixel
readback, URL sink, arbitrary context dispatch, WebGL or Package WASM.

Host policy bounds: 16 Controllers/Experience; 8 MiB QuickJS heap and 256 KiB stack
per Controller; 40ms cooperative invocation deadline and 1s Worker hard watchdog
(10s engine startup); 2s reported execution per 10s Experience window; 64 modules,
512 KiB source/compiled module code; 128 KiB structured message/batch; 64 queued
invocations/messages; 32 outstanding async and 4 live Operations per Controller.
Canvas allows 2048 commands/batch, 2048px per dimension, 32 save levels, 16 active
surfaces and 8M retained pixels/Experience. These guest heap limits exclude
browser/Worker/WASM engine overhead; native VM operations may reach the hard
watchdog before a cooperative interrupt. No browser global/network/storage is
injected. QuickJS WASM is a Host implementation detail, not `frontend-wasm` support.

Ordinary exceptions produce source-mapped diagnostics and disable the failed
Controller (optional declarative fallback, required local/root failure surface).
Budget/engine failures terminate the Worker and rebuild at most twice, restoring
props/component state from the Host. Rebuild revokes timers, Node/media requests,
images and Canvas buffers; old completions are discarded. Required repeated
failure escalates to the Host View failure surface. `getInstances()` reports
`loading/available/recovered/unavailable` script status for Host diagnostics.

Keep `init` presentation/read-only: automatic recovery never replays Actions,
Operations or parent emits. A fresh user event enables new writes, including its
async continuations; intent tokens are bounded and revoked on VM replacement.
VM restart never reloads SessionCore, changes Authority Epoch or cancels/replays
an authoritative write. Already-started Operations remain owned by the existing
Task lifecycle; their IDs continue to count against the Controller's quota until
terminal status is observed. Authority Epoch recovery still revokes the whole
old Component/Bridge/VM through the existing Host recovery path.

Executable examples: `tests/native/helpers/frontend-script-fixture.js` (vendored
layout/relationship map/animation), `frontend-script.test.js`, Script cases in
`frontend-bridge.test.js` and `frontend-v3.test.js`, and
`tests/frontend/native-frontend-script.smoke.mjs`. Worker bundling is part of the
normal webpack build (`/atria-script.bundle.js`), cached by dependency/source
fingerprint; generated engine bytes are not committed.
# Phase 7 — Studio and AI source authoring

Studio's UI destination opens the native `.aui` editor for `native@3` Experiences.
The Experience form declares a native source index and Runtime Features. When
switching from Text to a new frontend it proposes a minimal index/`Main.aui` in
the same reviewed Workspace; it never overwrites existing source files.
Choose an Experience and browse the Source Graph: View roots, Component contracts,
semantic Nodes, state scopes, interactions, scoped/global styles, Bridge bindings,
localization messages, media, assets and static Controller modules. Binary assets
remain read-only here. The Source destination remains available for file creation,
deletion and larger structural changes through the existing Authoring lifecycle.

The editor offers two complementary paths:

- Native source drafts retain their file and newline format while switching graph
  entries. **Check source** compiles drafts without changing ProjectStore or its
  revision. Diagnostics navigate to the original source, including JS/TS module
  errors, CSS, accessibility and localization advice. **Preview draft** uses the
  existing transactional Workspace evaluation, formal Build Compiler and production
  Renderer. It does not create a Play Session or enable authority writes.
- **Structured edit** addresses a stable semantic identity. Node text/attributes
  change only their CST token (identity is immutable); mixed-content replacement
  uses source editing. Component contracts, state, interactions, View metadata,
  Bridge bindings and locale messages use JSON value spans. Unchanged whitespace,
  comments, quote styles and sibling blocks remain intact. Replacing a whole
  contract or style intentionally replaces that block's contents.

Structured JSON field paths use `/` between keys, e.g. `state/component`,
`initial/count`, or `target/method`; an empty path replaces the selected JSON
value. JSON array indices are decimal path segments. Node fields are AUI names
such as `class`, `bind:text`, `on:click`, or `text`. Styles accept CSS text. Source
drafts must be reviewed or reloaded before a separate structured proposal.

The Project Agent exposes `atri_agent_frontend_graph` and
`atri_agent_frontend_patch`. Both use the existing Task/Plan/Workspace/Review
boundary. An example patch input (with the actual hash returned by discovery):

```json
{
  "ownerId": "package",
  "kind": "node",
  "componentId": "Main",
  "id": "greeting",
  "field": "text",
  "value": "Welcome",
  "contentHash": "<SHA-256 from Source Graph>"
}
```

`frontend.patch` targets the Workspace `core.project`. Kinds are `component`,
`node`, `view`, `binding`, `style`, `state`, `interaction`, and `message` (the last
also requires `locale`). `componentId` disambiguates Node/state/interaction/scoped
style IDs. Null Node attribute values remove the attribute through the API.
Each proposal pins its source hash and the existing project base revision. Multiple
patches to one file in a Workspace use the same baseline hash and apply in order.
Unknown/ambiguous IDs, stale hashes, identity rewrites and derived IR targets fail.
The Agent cannot commit; it stops at the existing human Review gate.

Feature support/reason codes, required flags, permission declarations and remote
origins are visible. A declaration is not permission consent; Preview retains the
existing Host permission/fallback policy. The same feature/permission closure
validator is used before Build and during package validation. No second renderer,
Session authority, raw DB access, durable KV or automatic Operation replay exists.

Validation is on demand rather than keystroke-triggered. Structured changes and
raw drafts are compiled before Review; final application validates again and rolls
back failures. General graph-level errors may point to a source file/block rather
than one token. Accessibility diagnostics are advisory, not certification.
