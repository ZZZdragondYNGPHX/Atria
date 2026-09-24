# Resource Bundle v1

A `.atriabundle` is UTF-8 JSON with `format: atria-resource-bundle`, `schemaVersion: 1`,
`createdAt`, an exact `root` reference, and a dependency-first `resources` array.
Each node records `ref`, canonical resource `data`, exact `dependencies`, and the
SHA-256 canonical-document `integrity`. Asset nodes include verified base64 bytes.
Limits are 32 MiB JSON, 512 resources and 64 dependency levels. Missing, ambiguous,
cyclic, unreachable, malformed and corrupted closures fail preflight.

Export reads Library exact revisions, current Project-owned exact content, or
hash-verified installed PackageVersion content. It never substitutes a Library
resource for a same-ID Package original. Player Secrets, credential material and
Connection/Model/Runtime Route references are excluded.

Authenticated Native Studio endpoints:

- `POST /resources/bundle/export`: `{ ref }`.
- `POST /resources/bundle/preflight`: `{ bundle, token? }`.
- `POST /resources/bundle/import`: `{ bundle, token }`.

Preflight does not write. It returns the remapped resource closure, source and
new destination identities, existing originals, blocking target conflicts and a
review token bound to the full bundle hash. Import always creates independent
Library identities. Immutable revisions retain origin/provenance, and exact
Prompt parent/module references and Knowledge entry relationships are rewritten.
Bindings and Assets map each exact snapshot to an independent identity because
their original logical identities cannot hold multiple immutable revisions.
Package originals remain immutable. Project authoring still uses Review/Apply.

The review token is a deterministic retry identity, not an authentication token;
the authenticated user owns every read and write. Import repeats preflight and
uses the existing repositories' immutable writes, resource locks and conflict
checks. The filesystem repository has no cross-resource rollback transaction.
Completed dependency copies may remain after interruption. The error reports
completed exact references; retrying the same bundle and token resumes those
same identities. Changing the file invalidates the old token. Re-selecting a
file intentionally starts a fresh review with fresh identities.

Resource types register through the existing Resource Registry and trusted
server-side `StudioService.registerResourceBundleAdapter(type, adapter)`.
Adapters provide read, dependencies, validate, rewrite, inspect and write methods
against their own existing authority. The bundle never supplies executable code,
creates a second resource store or installs a plugin. Core adapters cover Prompt
Module/Program, Generation Profile, World, Knowledge, Binding and Asset.
