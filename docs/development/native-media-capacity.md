# Native media and Work capacity

Package storage capacity, individual resource size, decoded memory and resident
browser caching are separate budgets. The stream path supports packages larger
than available browser or host cache memory; it does not promise smooth decoding
at every admission limit.

| Budget | Limit |
| --- | --- |
| Exact media library | 64 GiB, 4096 entries |
| Individual audio/video | 2 GiB |
| Individual image/font/other exact media | 16 MiB |
| Frontend structure | 32 MiB per graph, 2 MiB per resource, 256 resources |
| Resident browser encoded media cache | 64 MiB per mounted frontend |
| Streamed `.atria` container | 16 GiB |
| Uncompressed container | 64 GiB, 16384 entries |
| Individual streamed ZIP entry | 2 GiB |
| Buffer container builder/reader | 512 MiB archive, 1 GiB expanded |
| Materialized package file / metadata | 32 MiB |
| Server parsed archive cache | 256 MiB, at most 8 archives |

The authorities are `FRONTEND_LIMITS`, `PACKAGE_LIMITS` and
`ATRIA_PACKAGE_CONTAINER_LIMITS`. Executable structures, image decode memory,
control messages and authoring text have separate limits.

## Import, build and export

The local Work picker sends the browser File/Blob with
`Content-Type: application/octet-stream`. Preflight and install stream it to a
private temporary file. Options use the bounded, URI-encoded JSON
`X-Atria-Package-Options` header. Existing authentication, permission grants,
version pins and quota admission still apply.

The container remains format v2. Installation streams authenticated decryption,
ZIP expansion and CRC/SHA-256 validation. Large entries use temporary file
backing; a cold installed-package open does not materialize the archive in RAM.
Metadata and a bounded amount of small payloads remain resident. Temporary file
space is required in addition to durable installation space.

Host package builders can import `buildAtriaPackageContainerFile` from
`src/native/index.js`. It accepts the existing manifest/sourceFiles/assetPayloads
inputs, including host-owned file payloads, and returns an archive payload plus
preflight. Consume `archive.stream()` and always `await archive.close()` in a
`finally` block. `stageFilePayload` in `src/native/file-payload.js` creates an owned,
hashed payload from a readable stream; a request cannot supply an arbitrary local
path or forge this internal identity. The Buffer builder remains available for
small, already buffered authoring inputs.

Download an exact installed archive through the authenticated endpoint:

```text
GET /api/native/product/packages/:packageId/versions/:packageVersionId/archive?contentHash=<sha256>
```

It supports HEAD, ETag, Range, cancellation and backpressure. Legacy JSON/base64
imports and MCP export artifacts retain their independent 128 MiB limit. Large
exports must use the streaming endpoint; they are rejected before allocation by
the buffered export API. Studio's text-oriented project builder and portable
save/bundle formats keep their own budgets; the streaming runtime does not turn
all editor buffers into arbitrary-size binary editors.

## Runtime delivery and ownership

Audio/video uses a Session-authorized URL pinned to the exact package and declared
media hash. Browser playback and seeking request ranges instead of downloading
an entire Blob. HEAD/304 and hot small ranges reuse admitted blob identity; the
first cold blob read still verifies its digest. An open delivery holds its blob
lease until close, including cancellation and failed ranges.

Images and fonts retain the bounded reference-counted Blob cache. Replacing or
hiding images, disposing a frontend, and discarding late results release leases.
Decoded pixels and GPU textures are not covered by the encoded-byte budget.
Image normalization and mask encoding run in a bounded worker-thread pool rather
than blocking the host's event loop.

Package caches are shared across loader instances and keyed by owner and file
identity. Stamp checks include device/file identity, size and modification/change
and creation times. Changed blobs are re-admitted. Host readers obtain owned
byte copies without invalidating admitted declarations. Public Map reads expose
mutable caller bytes and therefore invalidate declaration reuse; caller changes
cannot mutate the archive cache. Large file-backed media is consumed with streams.

Controller snapshots are sent when their presentation version changes; time
updates are independent. Same-size Canvas redraws reset drawing state without
reallocating the backing dimensions. These reduce transport and allocation work;
they do not offload arbitrary UI JavaScript or guarantee a particular frame rate.

For deterministic multicore mechanics and host budgets, see
[Native transactions](native-transactions.md).
