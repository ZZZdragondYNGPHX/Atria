# Native product UX — Group 6

Branch: `fix/native-product-ux-audit`; pushed HEAD: `2f7a6a7ad` (implementation `b31ebf67a`).
Main baseline remains `ad15c1e0c3e15e625ba163e284a300c00811f10d`.

Independent issue commits:
027 `d033e3983`; 028 `73381a58d`; 029 `5a2dc50fe`; 030 `c8bb4d227`;
031 `616a95b5f`; 032 `b31ebf67a`.

## Group 6 — Studio / Skills / Prompt Authoring

### NUX-027

 Package rows identify read-only originals and offer View only; editor
entry and all public mutation endpoints reject Package writes, including scope-level
operations, moves and import destinations. Advanced compatibility scopes remain
collapsed. Moves
require confirmation explaining visibility changes and unchanged name references.

 A real Edge 390px scenario passed project name,
Package read-only controls, compatibility disclosure, project edit/save and confirmed
move to global.

### NUX-028

Studio uses domain editors for World composition, Knowledge semantics and now Skill
declarations. The Skill editor selects from the current project/global catalog,
explains unavailable declarations, adds/removes/edits IDs and preserves extension
fields through Source. Edits remain detached until existing ChangeSet Review/Apply. Loading failure retains the draft
and offers Retry. Native scope badges now preserve the kind label at narrow widths.

 The extended Runtime
Descriptor and localization suites passed 12 cases. Two real Edge 390px scenarios
passed semantic Skill declaration Review/Apply and adjacent Skill Manager ownership,
editing and movement. Both rendered screens were inspected. Source preserves unknown fields and Package originals remain unchanged.

### NUX-029

Build project cards and project detail now expose destructive deletion with explicit
source/history versus retained artifact explanations. Deletion uses Studio's existing
revision-protected authority. Concurrent edits remove the stale confirmation and require
reload plus renewed confirmation. Success refreshes Build and search; cancellation and
recoverable failure preserve the project and allow retry.

 A real Edge 390px scenario passed concurrent edit rejection, revision reload,
renewed confirmation, deletion and return to the project list while installed Works remain.
The conflict screenshot was inspected.

### NUX-030

Studio Assets now provides safe image/audio/video and inert text previews, media details,
name/path/metadata edits, explicit replacement and case-insensitive path collision feedback.
Moves, replacement bytes and manifest updates remain one reviewed revision-pinned workspace;
asset identity is retained. Used By resolves scoped Resource Graph consumers before removal,
blocks referenced assets and fails closed when lookup fails. Deletion requires confirmation
and rechecks dependencies before staging. Installed Package originals remain unchanged.

 A real Edge 390px scenario
passed import, text preview, collision refusal, rename plus replacement, stable identity,
reference inspection and reviewed removal.

### NUX-031

 Binary, non-UTF-8 and
oversized files remain read-only. A bounded inert textual diff shows changed line ranges
before review without truncating writes. Invalid drafts and per-file edits survive failures
and file switching. Explicit reload returns to committed content. Writes retain Studio's
revision-pinned Review/Apply boundary.

A real Edge 390px scenario passed invalid JSON retention, live textual diff, binary write
protection, restored draft and successful reviewed write.

### NUX-032

Prompt Module and Program stage conditions now use nested comparison/all/any/not controls. Program
parent and add/disable/replace/configure controls preserve exact references; configuration
uses the selected module's typed declarations. Unknown overrides remain visible and require
explicit correction. Advanced JSON remains available but cannot alter system provenance.
Stage rerenders preserve condition drafts. Controls reuse existing Atria fields and hierarchy.

 Source/localization regression passed nine cases. A real Edge
390px scenario passed typed defaults, stage condition, exact parent/configure authoring and
immutable revision save. The final control screenshot was inspected after correcting inherited
checkbox styling.
