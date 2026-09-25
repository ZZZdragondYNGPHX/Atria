# Native product UX — Group 7

Branch: `fix/native-product-ux-audit`.
Baseline: Group 6 `2f7a6a7ad`.

Issue commits:
- NUX-033 `b3fe81de8`: one exact Resource Bundle contract and reviewed import/export.
- NUX-034 `aadbe3462`: installed Package World/Knowledge originals and independent forks.
- NUX-035 `789685819`: exact installed-version Session start.
- NUX-036 `3e979e1e0`: update impact and installation consent management.
- NUX-037 `b2df99c61`: in-place Save dependency recovery.
- NUX-038 `f82a026e3`: Session naming and metadata-safe rename.
- NUX-039 `e39593852`: readable committed branch/revision history.
- NUX-040 `1501d17b3`: navigable reference remediation and safe earlier-revision deletion.
- Regression fixture `211e2a9ed`: exact Package original navigation expectation.

### NUX-033

Resource Bundle v1 exports a root plus verified exact closure from Library, Project
or installed Package resources. Shared preflight rejects missing/cyclic/unreachable
or corrupted dependencies and player configuration. Reviewed imports create independent
identities through existing repositories, rewrite references and retain provenance.
Interrupted writes report completed copies and resume with the same review identity.
Trusted Resource Registry adapters extend this format to additional resource types.
Prompt/Generation and World/Knowledge surfaces expose export and reviewed import,
including historical World/Knowledge revisions. No new store or Project write path.
Contract: [Resource Bundle](resource-bundle-contract.md).

Validation: six Native suites passed 21 cases; four Shell suites passed 15 cases;
final file-picker/localization checks passed six. Real Edge at 390px passed actual
export, read-only review, interruption, same-token retry, independent identity and
navigation. The final screenshot was inspected after adding a keyboard-accessible
file selection button. Changed product JavaScript passed ESLint and diff checks.

### NUX-034

World and Knowledge Library lists now include exact originals from every installed
PackageVersion. Read-only detail shows the owning Work/version, exact identity and
content, Used By, export and reviewed Fork to Library. Fork copies the verified
complete closure through Resource Bundle rather than retaining mutable shared bindings.
The existing Resource Graph now represents Package Worlds, Knowledge, Bindings and
Assets, including EntryPoint usage. Reference rows navigate directly to supported
Package originals. Failed Package discovery has local retry and preserves Library content.

Validation: six Native/Shell/localization suites passed 23 cases; two additional UI
cases covered discovery retry and inert read-only content. Real Edge at 390px passed
World/Knowledge original browsing, exact Used By and a three-resource independent
Fork. Screenshot inspected; changed JavaScript ESLint and diff checks passed.

### NUX-035

Installed Work version rows resolve the selected hash-verified PackageVersion and
its own EntryPoints before explicit Session creation. Current/default and non-default
versions are explained; neither the Work default nor existing Session pins changes.
The primary Start New action also sends the displayed exact version. Retrying an
open failure after successful version-specific creation reuses that created Session.

Validation: Native product service/HTTP passed 15 cases and adjacent Shell/localization
passed ten. Real Edge at 390px installed a second version with a different EntryPoint,
started the original exact version and verified the newer default stayed unchanged.
Screenshot inspected; changed JavaScript lint and diff checks passed.

### NUX-036

Authenticated update preflight compares installed/default and incoming versions,
added/removed/changed permission requirements, capability changes and pinned Sessions.
A changed default invalidates the reviewed update; damaged installed content remains
repairable with an explicit unavailable-comparison warning and full permission review.
Permission names have readable descriptions and literal author rationale.

Work detail now presents each exact installed version's permission state and supported
management model. The established Package contract is installation-time consent, not a
stored per-permission runtime grant service: required declarations were accepted during
installation; optional declarations have no separately recorded grant. The UI states this
explicitly. Revoking installation consent follows the existing guarded Work uninstall path,
with links to dependent Sessions for export/removal. Updates do not revoke old versions or
retarget existing Sessions. No ineffective runtime switches or second permission authority
were introduced.

Validation: five Native/Shell/localization suites passed 25 cases, including update deltas,
required consent, stale-review rejection, immutable Session pins and guarded uninstall.
Real Edge at 390px passed missing-consent refusal, explicit grant, installation, version
permission inspection and navigation to dependent Sessions. Screenshot inspected; lint and
diff checks passed.

### NUX-037

Library and Play Save import now recover the exact Work in place: choose a matching
Package, review required consent, install, re-preflight the same Save and continue import.
Identity, version and full archive hash are checked in UI and server before any installation.
Existing default Work versions and names survive installation of an older Save dependency.
Recheck and inspect-installed-Work actions support recovery performed elsewhere; immutable
same-ID content conflicts retain the normal repository guards.

Validation: product/HTTP/Package suites passed 21 cases. Save-system/Play/recovery checks
passed 17 cases with two explicit optional MySQL/PostgreSQL skips (those local services
refused connections in the initial unfiltered run); filesystem and SQLite round trips passed.
Earlier recovery/localization checks passed nine cases. Both real Edge 390px Library and
Play scenarios rejected a wrong-hash file, installed the exact Work and imported/opened the
same Save identity. Screenshots inspected; changed JavaScript lint and diff checks passed.

### NUX-038

Work creation (default and selected installed version) accepts an optional Session name.
Library My Games and Play Timeline offer rename/clear with conflict-aware current-name
reload. Names update only mutable Session presentation metadata under the existing
Session write queue and integrity CAS; immutable history and exact Package pins remain.
Snapshot publication preserves the latest name across a generation draft captured before
renaming. A metadata lifecycle event refreshes active Play without disturbing a Draft.

Validation: Native product/HTTP/Core checks passed 37 cases with 18 optional DB skips;
additional filesystem/SQLite naming contract cases passed two. Four UI/durability/
localization suites passed 26 after supplying the jsdom structuredClone test shim.
The final real Edge 390px scenario passed naming at creation, concurrent-name conflict,
draft retention, explicit reload and rename in both Play and Library while preserving
identity/history. Test navigation now dismisses its modal before opening Library.
Screenshot inspected; changed JavaScript lint and diff checks passed.

### NUX-039

Play Timeline now renders readable branch names/current markers, fork source/revision,
branch heads and parent-linked revision ordinals. History reads only committed revisions
reachable from Session HEAD or Saves and excludes unpublished orphan writes. Exact
inspection uses existing read-only historical Session loading; it never changes the
active branch. Rows render in batches of 50 and raw payloads stay in Details.

Validation: filesystem and SQLite history contract cases passed, including orphan
exclusion and exact parent/fork relationships. Four UI/HTTP/localization suites passed
21 cases covering bounded rendering, ancestry validation and inspection. Real Edge at
390px passed history failure/retry, branch origins and read-only inspection with unchanged
active HEAD/branch. Screenshot inspected; changed JavaScript lint and diff checks passed.

### NUX-040

Reference failures across Library, Runtime, Prompt and Studio now resolve named owners
and offer existing owner navigation with legal remediation guidance. Lookup failure has
local retry; exact details stay collapsed. Session blockers locate My Games management
without deleting progress. Library preflight uses the same flow. Earlier World/Knowledge
revisions can be explicitly deleted only after Resource Graph and repository guards
allow it; current revisions, Project references and Knowledge bindings remain protected.
Package originals cannot use this operation. Existing authoring stays on Review/Apply.

Validation: ten focused/adjacent suites passed 46 cases; the additional authenticated
revision HTTP boundary suite passed six. Tests cover graph/Project/current/binding
protection, safe removal, exact Runtime navigation, reference lookup retry and Session
management. Real Edge at 390px passed Work deletion blockers and navigation with unchanged
Session HEAD; screenshot inspected. Changed JavaScript lint and diff checks passed.
An initial test command named a nonexistent Runtime test file; the corrected adjacent
suite command passed. No user-owned workspace rules were staged.

## Group regression

Group 7 regression: 133 Native/Shell/Skills/Skills UI/Skills endpoint suites ran;
1246 cases passed, 72 skipped, with one outdated Package navigation expectation.
After correcting that fixture, three adjacent suites passed seven cases (all failing
coverage is now green). Full source/public ESLint and frontend cache compilation passed.
Nine real Edge 390px scenarios passed in native-session/15-native-portability.e2e.js,
covering Bundle retry, immutable originals, exact Work versions, update consent, Library
and Play Save recovery, Session naming/concurrency, readable history and reference
resolution. Current history and reference-remediation screenshots were inspected;
earlier issue-specific screenshots were also inspected. No live MySQL/Postgres,
paid-provider, physical-device, Android-build or Docker claim.

Next: Group 8 NUX-041.
