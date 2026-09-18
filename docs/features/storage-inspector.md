# Storage Management

Atria exposes one unified **Storage Management** surface under **User Settings → Account**. The former standalone **Storage Inspector** and **Browser Storage** actions have been merged into one capability-driven resource manager.

The account page now keeps three maintenance actions:

- Settings Snapshots
- Backup & Sync
- Storage Management

## Server Data

**Entry:** User Settings → Account → **Storage Management** → **Server Data**

The server view groups the current account's stored data into the existing Atria categories such as Chats, Characters, Worldbooks, Images, Attachments, Presets, Extensions, Vectors, Backups, and Other.

Each row declares what the resource can safely do. The UI renders actions from those capabilities instead of assuming every resource is an editable file.

### Safe resource actions

Text-like resources can expose:

- inspect / preview;
- edit;
- delete;
- recovery.

JSON is parsed before save. JSONL is validated line by line. Editable content has a size limit, is written through a temporary file, validated again, and then atomically renamed into place.

Every generic server-side edit or delete creates a recovery point before the mutation. Recent storage recovery points can be listed and restored from the same Storage Management surface.

### Protected resources

Generic Storage Management intentionally does not expose plaintext or destructive controls for sensitive/internal resources such as:

- `secrets.json`;
- SQLite database files;
- SQLite WAL/SHM files;
- storage-engine dump/meta artifacts.

Those rows can expose safe metadata only. Domain-level account, secret, character, chat, preset, and storage-engine workflows remain responsible for their higher-level invariants.

High-level identity resources whose deletion has domain cascades are not blindly deleted through the generic file mutator.

![Server storage overview](/images/storage-inspector/01-self-l1.png)

![Chats drill-down](/images/storage-inspector/02-self-chats-drilldown.png)

## Browser Data

**Entry:** User Settings → Account → **Storage Management** → **Browser Data**

The browser view manages storage local to the current origin/device:

- `localStorage`;
- `sessionStorage`;
- IndexedDB;
- Cache Storage;
- Storage Quota.

### localStorage / sessionStorage

These support full CRUD:

- list/search through the shared inspector;
- view values;
- edit values;
- create keys;
- delete keys.

### IndexedDB

IndexedDB drills down through:

```
Database
  -> Object Store
     -> Record
```

Records expose their keys and value summaries. Plain JSON-compatible values can be edited and deleted.

Values that cannot be safely round-tripped through plain JSON remain view-only, including types such as:

- Blob;
- ArrayBuffer / typed arrays;
- Date;
- Map;
- Set;
- other structured-clone values with non-plain prototypes.

Deleting an object-store row at the store level clears that store; deleting a database removes the database.

### Cache Storage

Cache Storage drills down through:

```
Cache
  -> Request / Response
```

A cached request can be inspected, including URL, response status, headers, and a bounded response-body preview. Individual cached requests or whole caches can be deleted.

Response editing is intentionally not supported because rebuilding a Response can change headers, encoding, or stream semantics.

### Quota

Storage Quota is read-only and uses the browser's `navigator.storage.estimate()` result when available.

![Browser storage overview](/images/browser-storage-inspector/01-browser-l1.png)

![IndexedDB drill-down](/images/browser-storage-inspector/02-indexeddb-l2.png)

![Delete confirmation](/images/browser-storage-inspector/03-delete-confirm.png)

## Safety model

The unified manager follows a capability model similar to:

```js
{
    view: true,
    viewContent: true,
    edit: false,
    delete: true,
    download: false,
    restore: true,
}
```

The shared UI shows only actions supported by the resource/provider.

Server mutations are guarded by path whitelisting and user-root containment checks. The manager is not a general arbitrary filesystem browser.

## FAQ

**Do Server Data and Browser Data refer to the same storage?**

No. Server Data belongs to the signed-in Atria account and lives on the Atria host/storage engine. Browser Data belongs only to the current browser origin/device.

**Can Storage Management reveal API keys from secrets.json?**

No. The generic manager exposes only safe metadata for protected secrets/storage-engine resources.

**Can I undo a server-side edit or delete?**

Yes. Supported generic server mutations create recovery points before applying the change, and recent points can be restored from Storage Management.

**Why are some IndexedDB records not editable?**

IndexedDB uses the Structured Clone algorithm and can contain values that JSON cannot faithfully represent. Atria edits only values that can be safely round-tripped as plain JSON.

**Why does a browser database/cache show `?` for size?**

Browsers do not provide a cheap exact per-database or per-cache byte total. The top-level browser quota uses the aggregate estimate instead.
