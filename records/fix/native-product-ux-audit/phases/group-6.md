# Native product UX — Group 6

Branch: `fix/native-product-ux-audit`; pushed HEAD: `2f7a6a7ad` (implementation `b31ebf67a`).
Main baseline remains `ad15c1e0c3e15e625ba163e284a300c00811f10d`.

Independent issue commits:
027 `d033e3983`; 028 `73381a58d`; 029 `5a2dc50fe`; 030 `c8bb4d227`;
031 `616a95b5f`; 032 `b31ebf67a`.

## Group 6 — Studio / Skills / Prompt Authoring

### NUX-027

Skill Manager now groups Native global/project/exact PackageVersion scopes, resolves
human owner names, and preserves exact scope identity for filtering, collision checks
and API URLs. Package rows identify read-only originals and offer View only; editor
entry and all public mutation endpoints reject Package writes, including scope-level
operations, moves and import destinations. Advanced compatibility scopes remain
collapsed. Project editing keeps existing SkillRepository/file-hash concurrency;
project destinations are picked from the current Native project catalog. Moves
require confirmation explaining visibility changes and unchanged name references.

Validation: ten focused/adjacent suites covered 211 passing cases after correcting
an unnecessary async yield in the optional owner-catalog path; the 14-case interactive
scope-picker suite passed on rerun. A real Edge 390px scenario passed project name,
Package read-only controls, compatibility disclosure, project edit/save and confirmed
move to global. Current Skills UI screenshot inspected; lint/diff checks passed.

### NUX-028

Studio uses domain editors for World composition, Knowledge semantics and now Skill
declarations. The Skill editor selects from the current project/global catalog,
explains unavailable declarations, adds/removes/edits IDs and preserves extension
fields through Source. Edits remain detached until existing ChangeSet Review/Apply.
Shared declaration validation rejects malformed, duplicate and conflicting IDs both
in authoring and Native Package/Runtime compilation. Loading failure retains the draft
and offers Retry. Native scope badges now preserve the kind label at narrow widths.

Validation: seven focused/adjacent suites passed 51 cases. The extended Runtime
Descriptor and localization suites passed 12 cases. Two real Edge 390px scenarios
passed semantic Skill declaration Review/Apply and adjacent Skill Manager ownership,
editing and movement. Both rendered screens were inspected. Lint and diff checks
passed; Source preserves unknown fields and Package originals remain unchanged.

### NUX-029

Build project cards and project detail now expose destructive deletion with explicit
source/history versus retained artifact explanations. Deletion uses Studio's existing
revision-protected authority. Concurrent edits remove the stale confirmation and require
reload plus renewed confirmation. Success refreshes Build and search; cancellation and
recoverable failure preserve the project and allow retry.

Validation: five focused suites passed 16 cases; extended HTTP/localization checks passed
nine cases. A real Edge 390px scenario passed concurrent edit rejection, revision reload,
renewed confirmation, deletion and return to the project list while installed Works remain.
The conflict screenshot was inspected. Changed-file lint and diff checks passed.

### NUX-030

Studio Assets now provides safe image/audio/video and inert text previews, media details,
name/path/metadata edits, explicit replacement and case-insensitive path collision feedback.
Moves, replacement bytes and manifest updates remain one reviewed revision-pinned workspace;
asset identity is retained. Used By resolves scoped Resource Graph consumers before removal,
blocks referenced assets and fails closed when lookup fails. Deletion requires confirmation
and rechecks dependencies before staging. Installed Package originals remain unchanged.

Validation: five focused/adjacent suites passed 19 cases, followed by the extended six-case
StudioService suite including atomic move/replace/manifest behavior. A real Edge 390px scenario
passed import, text preview, collision refusal, rename plus replacement, stable identity,
reference inspection and reviewed removal. Rendered editor inspected; lint/diff checks passed.

### NUX-031

Source now identifies file types, validates JSON/JSON Lines/YAML/XML and invokes the
existing component compiler for declared structured UI sources. Binary, non-UTF-8 and
oversized files remain read-only. A bounded inert textual diff shows changed line ranges
before review without truncating writes. Invalid drafts and per-file edits survive failures
and file switching. Explicit reload returns to committed content. Writes retain Studio's
revision-pinned Review/Apply boundary.

Validation: three focused/adjacent suites passed 11 cases and localization passed four.
A real Edge 390px scenario passed invalid JSON retention, live textual diff, binary write
protection, restored draft and successful reviewed write. Screenshot inspected; lint and
diff checks passed.

### NUX-032

Prompt Module and Program stage conditions now use nested comparison/all/any/not controls.
Typed parameter definitions distinguish absent defaults from explicit values; shared resource
validation rejects default-type mismatches and names runtime binding cannot consume. Program
parent and add/disable/replace/configure controls preserve exact references; configuration
uses the selected module's typed declarations. Unknown overrides remain visible and require
explicit correction. Advanced JSON remains available but cannot alter system provenance.
Stage rerenders preserve condition drafts. Controls reuse existing Atria fields and hierarchy.

Validation: five focused/adjacent suites covered 101 passing cases, including Native Prompt
compiler and resource contracts. Source/localization regression passed nine cases. A real Edge
390px scenario passed typed defaults, stage condition, exact parent/configure authoring and
immutable revision save. The final control screenshot was inspected after correcting inherited
checkbox styling. Lint/diff checks passed.



## Group regression

125 Native/Shell/Skills/Skills UI/Skills endpoint suites passed: 1210 cases;
68 optional external database cases skipped. All Group 6 changed JavaScript files
passed ESLint, and diff checks passed. Frontend cache compilation passed using
`npm run frontend:prebuild-cache -- --dataRoot tests/.e2e-scratch/native-ux-g6-build`.
All 11 real Edge scenarios passed in the Studio redesign and Native authoring specs.
Coverage includes 1440/900/320px, Chinese/large text/safe area/reduced motion/virtual
keyboard simulation, loading failure/retry, revision conflicts, Project Agent,
Skills, deletion, Assets, Source and Prompt semantics. Current narrow-screen
Skills, Asset and Source screenshots were inspected; Prompt control screenshots
were inspected in the focused run. Existing Stable Diffusion startup probes on
an absent local service were non-fatal; no live inference validation is claimed.

Use workspace rules; preserve uncommitted AGENTS.md/FORK_MAINTENANCE.md changes.
No live paid-provider, physical Android, Android build or Docker validation claimed.

Next: Group 7 NUX-033, one exact Resource Bundle mechanism.
