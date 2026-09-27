# Atria browser extension SDK v1

External extensions are HTTPS Git repositories with this root `atria.extension.json`:

```json
{"schemaVersion":1,"apiVersion":1,"name":"Example","entrypoint":"src/main.js"}
```

The entrypoint is an ES module exporting `activate(sdk)`. It may be async and
return one cleanup function (which may itself be async), or return undefined.
Local scripts use exactly `index.js` with the same module/activation contract.
Keep side effects inside activation, not at module top level.

```js
export function activate(sdk) {
    const node = document.createElement('p');
    node.textContent = sdk.context.packageId ? 'Work extension active' : 'Global extension active';
    sdk.ui.mount(node);
    sdk.events.on('REVISION_COMMITTED', () => {
        node.textContent = 'Native revision committed';
    });
    return () => { /* Dispose resources acquired outside SDK helpers here. */ };
}
```

## Scope and ownership

Enablement and Global / Prompt preset / Work targets are authenticated user
metadata, separate from Package content. Work matches the whole Package ID.
Multiple matching targets activate an extension once. The active preset is the
primary narrator Runtime route's owning Prompt preset, resolved through the
same owner lookup as Native Regex; display names and per-call route overrides
are not scope identities.

`sdk.context` is an immutable identity view: `sessionId`, `packageId`,
`packageVersionId`, `entryPointId`, `branchId`, `presetId`, `historical`, `ready`,
`epoch`. It contains no raw World state or credential. Ordinary revision
publication does not restart the extension. Context/Ready changes, explicit
restore/branch activation, refresh, config changes, edit, disable and deletion
dispose old instances. A same-context `SESSION_LOADED` caused by a typed
operation is not a context switch.

`sdk.signal` aborts at disposal. After an await, check it before using anything
outside the SDK. Calls through an obsolete SDK fail. Late activation's returned
cleanup runs immediately; its SDK-owned resources have already been removed.
Known cleanup promises finish before the next activation of the same ID.
Uncooperative user code can still hang or use browser globals: this is trusted
page JavaScript, **not a sandbox**.

## API

- `apiVersion`: `1`.
- `onDispose(fn)`: register cleanup; returns an idempotent early-release function.
- `assetUrl(path)`: authenticated, revision-bound URL inside this extension.
- `ui.mount(node)`: append a new unattached DOM node to the owned extension root;
  returns a removal function. Never moves an existing product UI node.
- `ui.style(cssText)`: owned style element; returns removal. Styles are page CSS,
  not isolated CSS. Authors must scope selectors.
- `events.on(type, fn)`: subscribe to a `NATIVE_SESSION_LIFECYCLE` event name.
  Delivers only `{type, context}` metadata, never the raw event snapshot.
- `events.listen(target, type, fn, options)`: owned DOM event listener; returns unsubscribe.
- `timers.timeout(fn, ms)` / `timers.interval(fn, ms)`: owned timers; return cancellation functions.
- `native.getInformationProjection`, `getTemporalProjection`, `getActorAvailability`,
  `getContinuityProjection`: copied results from existing Native capability APIs.
- `native.lifecycleCommand`, `continuityCommand`, `realmCommand`, `activityCommand`,
  `presentScene`: existing typed capability operations with unchanged argument
  contracts. They require an active ready Session; the existing Host enforces
  read-only/history/busy, exact revisions, declarations, ownership and schema.
  There is no raw state-write adapter or new generation entrypoint. In-flight
  operations already admitted by the Native authority are not rolled back by
  disposal; late results are rejected by the old SDK.

Use the catalog's lifecycle/presentation/information/continuity/shared references
for the underlying operation contracts. A Skill or extension never rewrites
those contracts or grants server permissions.

## Files, management and diagnostics

Relative `import './helper.js'` and `new URL('../data.json', import.meta.url)`
stay in the revision-bound installed-file directory. `sdk.assetUrl('style.css')`
addresses the extension root. The API verifies enabled state and revision on
every delivered file. Existing module evaluation is cached by the browser;
activation repeats for each Host instance.

Current import limits: 128 files, 4 MiB combined, 12 directory levels, strict
UTF-8 text; JS/MJS/CSS/JSON/SVG are served with their appropriate MIME types.
Binary media, symlinks, Node dependencies and install scripts are not supported.
No repository code executes during installation. External installation/update
always saves disabled, and invalid/conflicting updates retain prior content.

`Atria.extensions.client` exposes `list`, `get(id)`, `save(value, expectedRevision)`,
`remove(id, expectedRevision)`, and `install(url, {id, expectedRevision})` over the
existing authenticated API. Successful mutations notify the Host. To refresh
changes made elsewhere, call `Atria.extensions.refresh()`. Runtime diagnostics
are available from `getStatus()` and `subscribe(listener)`. A failed extension
is isolated from the other activations; edit/enable/refresh to retry.

Startup happens after APP_READY and never holds the app's boot barrier.
The existing shell legacy-recovery mode skips this extension Host. Dedicated
Extensions management UI belongs to the next phase.
