# Native media and Work capacity

This page describes the current implementation, not a requirement to add checks.
Implementation changes follow `docs:README.md` §12.1–§12.2: use the existing
admission boundary and reuse accepted identities; do not add whole-library or
whole-archive verification to ordinary gameplay, rendering or cache hits.

Local Work import separates the encoded media library from frontend structure and
the resident browser cache. These are admission limits, not a promise of smooth
playback at the maximum size.

| Budget | Limit | Authority |
| --- | --- | --- |
| Exact media library | 256 MiB, 4096 entries | `FRONTEND_LIMITS` |
| Individual exact media | 16 MiB | `FRONTEND_LIMITS` |
| Frontend structure, source and compiled graph | 32 MiB per graph, 2 MiB per resource, 256 entries | `FRONTEND_LIMITS` |
| Resident exact media, encoded bytes | 64 MiB per mounted frontend | `FRONTEND_LIMITS` |
| `.atria` container | 512 MiB | `PACKAGE_LIMITS` |
| Uncompressed container content | 1 GiB, 16384 entries | `PACKAGE_LIMITS` |
| Individual container file | 32 MiB | `ATRIA_PACKAGE_CONTAINER_LIMITS` |
| Server parsed archive cache | 256 MiB, at most 8 entries | `package-composition.js` |

`FRONTEND_LIMITS` lives in `public/shared/native-frontend-contract.js` and
`PACKAGE_LIMITS` in `public/shared/native-package-limits.js`. Compiler, graph
validation and browser admission share the frontend budgets. Separate structural
budgets preserve browser script, command, DOM and state constraints. Hashes,
declared media types, exact paths and container compression checks still apply.

Dynamic local media acquires a shared lease. The cache reserves encoded bytes
before loading, shares pending requests, and evicts the least recently used idle
Blob URL when capacity is needed. Live leases cannot be evicted. If all remaining
space is in use, a new request fails with `frontend_asset_cache_budget`. Releasing
a lease makes its resource evictable; reloading checks its hash again. Creating a
Blob does not leave a second byte-array cache behind.

Image replacement, explicit `hidden` ancestors (including component shadow roots),
disposal and stale results release their leases. CSS visibility alone does not
control leases. CSS asset URLs and fonts remain pinned until frontend disposal.
Decoded pixels, GPU textures and remote media are outside the encoded-byte
budget. Prefer scene-sized images and virtualized lists over simultaneously
displaying an entire catalog.

The local Work picker and save-dependency recovery send a `Blob` using
`application/octet-stream` to the authenticated package preflight/install routes.
Install options travel in a bounded `X-Atria-Package-Options` header containing
URI-encoded JSON. Permissions, exact dependency identity and base-version checks
are unchanged. Legacy JSON/base64 import and MCP temporary artifacts retain their
independent 128 MiB archive limit; save imports and `.atriabundle` resource bundles
retain their own limits. Use local binary Work import for larger packages.

Archive memoization includes encoded archive bytes, decoded file bytes and an
estimate of metadata size in its budget. Runtime cache hits check the owning
installation and the blob's device/file identity, size, modification/change and
creation stamps, then return byte maps that copy each payload on its first read.
Returned buffers, including their backing stores, remain caller-owned; keys and
metadata reads do not copy the scene library. Cold, changed and
export reads verify the complete archive. This lightweight runtime path assumes
host-managed immutable blobs; it is not a fresh cryptographic verification of
every byte on each action. A deliberately external rewrite preserving all file
stamps is outside that fast-path guarantee. Cache size is not a process
memory ceiling: encryption, ZIP processing, validation and caller copies allocate
additional buffers. The current container is processed as a whole. A 1 GiB
encoded Work or streaming installation requires a separate container/transport
design and measurement; raising a constant alone does not provide that support.

Rule artifact cache hits compare the exact bytes of the linked JS/TS modules.
Scene images and unrelated files are not scanned on every computation stage.
Changing or removing any linked module recompiles the artifact; its evidence
identity is computed once per compilation. Inputs and outcomes are never cached.

Server Authority computation has its own 100 ms wall-clock budget per stage in
`AUTHORITY_EXECUTION_LIMITS.computationWallMs`. This includes loading the module,
freezing the bounded transaction input and executing the handler. UI controllers
retain their 40 ms budget. Deep input immutability, 8 MiB guest heap, stack,
input/output and overall Authority work budgets still apply. Slow or unbounded
rules are interrupted, with no partial transaction publication.

For hidden continuation inputs and smaller invariant modules, see
[Native transactions](native-transactions.md).
