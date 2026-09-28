# Native Frontend v3 authoring — Phase 2

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

Phase 2 does not implement executable Bridge bindings. Existing `read`/action
IR links remain unavailable; they never fall back to old selector/command
dispatch. Bridge/Data Plane starts in Phase 3. Conversation, Remote Media,
Localization/IME, Script VM, Canvas and the Studio visual editor remain in their
scheduled later phases.
