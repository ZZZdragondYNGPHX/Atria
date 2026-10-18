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

 Shared preflight rejects missing/cyclic/unreachable
or corrupted dependencies and player configuration. Reviewed imports create independent
identities through existing repositories, rewrite references and retain provenance.
Interrupted writes report completed copies and resume with the same review identity.
Trusted Resource Registry adapters extend this format to additional resource types.
Prompt/Generation and World/Knowledge surfaces expose export and reviewed import,
including historical World/Knowledge revisions. No new store or Project write path.
Contract: [Resource Bundle](https://github.com/ZZZdragondYNGPHX/Atria/blob/main/docs/development/resource-bundle.md).

 Real Edge at 390px passed actual
export, read-only review, interruption, same-token retry, independent identity and
navigation. The final screenshot was inspected after adding a keyboard-accessible
file selection button.

### NUX-034

World and Knowledge Library lists now include exact originals from every installed
PackageVersion. Read-only detail shows the owning Work/version, exact identity and
content, Used By, export and reviewed Fork to Library.
The existing Resource Graph now represents Package Worlds, Knowledge, Bindings and
Assets, including EntryPoint usage. Reference rows navigate directly to supported
Package originals. Failed Package discovery has local retry and preserves Library content.

 Real Edge at 390px passed
World/Knowledge original browsing, exact Used By and a three-resource independent
Fork.

### NUX-035

 Current/default and non-default
versions are explained; neither the Work default nor existing Session pins changes.
The primary Start New action also sends the displayed exact version. Retrying an
open failure after successful version-specific creation reuses that created Session.

### NUX-036

Authenticated update preflight compares installed/default and incoming versions,
added/removed/changed permission requirements, capability changes and pinned Sessions.
Permission names have readable descriptions and literal author rationale.

Work detail now presents each exact installed version's permission state and supported
management model. The established Package contract is installation-time consent, not a
stored per-permission runtime grant service: required declarations were accepted during
installation; optional declarations have no separately recorded grant. The UI states this
explicitly. Revoking installation consent follows the existing guarded Work uninstall path,
with links to dependent Sessions for export/removal. Updates do not revoke old versions or
retarget existing Sessions. No ineffective runtime switches or second permission authority
were introduced.

Real Edge at 390px passed missing-consent refusal, explicit grant, installation, version
permission inspection and navigation to dependent Sessions.

### NUX-037

Library and Play Save import now recover the exact Work in place: choose a matching
Package, review required consent, install, re-preflight the same Save and continue import.
Existing default Work versions and names survive installation of an older Save dependency.

### NUX-038

Work creation (default and selected installed version) accepts an optional Session name.
Library My Games and Play Timeline offer rename/clear with conflict-aware current-name
reload.
Snapshot publication preserves the latest name across a generation draft captured before
renaming. A metadata lifecycle event refreshes active Play without disturbing a Draft.

 Four UI/durability/
localization suites passed 26 after supplying the jsdom structuredClone test shim.
The final real Edge 390px scenario passed naming at creation, concurrent-name conflict,
draft retention, explicit reload and rename in both Play and Library while preserving
identity/history. Test navigation now dismisses its modal before opening Library.

### NUX-039

Play Timeline now renders readable branch names/current markers, fork source/revision,
branch heads and parent-linked revision ordinals. History reads only committed revisions
reachable from Session HEAD or Saves and excludes unpublished orphan writes. Exact
inspection uses existing read-only historical Session loading; it never changes the
active branch. Rows render in batches of 50 and raw payloads stay in Details.

 Real Edge at
390px passed history failure/retry, branch origins and read-only inspection with unchanged
active HEAD/branch.

### NUX-040

Reference failures across Library, Runtime, Prompt and Studio now resolve named owners
and offer existing owner navigation with legal remediation guidance. Lookup failure has
local retry; exact details stay collapsed. Session blockers locate My Games management
without deleting progress. Library preflight uses the same flow.
Package originals cannot use this operation. Existing authoring stays on Review/Apply.

 Tests cover graph/Project/current/binding
protection, safe removal, exact Runtime navigation, reference lookup retry and Session
management. Real Edge at 390px passed Work deletion blockers and navigation with unchanged
Session HEAD; screenshot inspected.
An initial test command named a nonexistent Runtime test file; the corrected adjacent
suite command passed. No user-owned workspace rules were staged.
