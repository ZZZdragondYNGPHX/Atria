# World and Knowledge workflow repair

Status: complete, 2026-09-25. Main: `23bfdc608b5e5ee2b6b863f116d118d529b0bab9`.
Implementation: `45f0fdbd56dac8dd46e80431b3cd094eb67a34ea`.
Baseline: `aa3a0b0dcfbfc451c696990794ccf16390e7fba3`.

## Problem and corrected acceptance

Prior NPC verification covered Library revision editing, but users normally entered installed Work originals. Those pages were read-only with the fork hidden at the bottom. Entry actions were hidden behind revision editing, parameters were largely JSON, and Work/Session resource selection did not exist. The user explicitly required changing existing Session bindings as well as future starts.

## Delivered behavior

- Installed originals and Library World/Knowledge details have a prominent **Create editable copy** action using the existing exact dependency bundle import. Originals remain immutable.
- Library Knowledge details expose **Add entry**, **Edit entry**, **Delete entry** and an enabled checkbox. Edits remain detached drafts until Review/Save publishes an immutable revision. Referenced entries cannot be removed without resolving their entry relations. Adding to an empty base does not invent an extra blank entry.
- Named read-only parameters show discovery, conditions, probability, sticky/cooldown/delay, placement, priority, visibility, target, budget and relations. The editor opens common groups and uses a desktop list/detail layout with compact field grids; narrow screens retain stacked controls. World baseline values have named rows; raw schema/identity remain inspectable details.
- Work details expose **Configure Worlds & Knowledge** for each starting point. Existing Sessions expose **Manage → Worlds & Knowledge** in My Games. Resource rows use a checkbox and revision selector; exact IDs are secondary details. Users may detach Package defaults and select Library copies/revisions.
- Saving choices for the currently open Session reloads its runtime projection immediately. Generation must be stopped before changing that active Session's resource choices.

## Native authority and state decisions

- Work defaults use existing PackageState, namespace `atri_resource_setup_<entryPointId>`, with an exact PackageVersion and optimistic integrity token. Updating a Work version does not silently apply defaults made for another version.
- Selected Worlds are exact snapshots in revision-backed `atri_world_selection`. Generic runtime writes cannot mutate this reserved namespace. Session Core validates world IDs/revisions and the primary selection; unchanged exact Worlds retain state, while replacements start from their baseline. Timeline and prior revisions remain recoverable.
- Optional `packageBindingIds` in the existing KnowledgeBindingSet records explicit Package binding selection. Absent selection preserves the old exact-default contract. Selected Package bindings retain authored policy; chosen Library Knowledge is copied into Session-owned exact snapshots, independent of later Library changes.
- Resource changes publish one Session revision using expected HEAD, clear derived Knowledge lifecycle state, and preserve immutable history. Game World resolution respects explicit Session World selection instead of overriding it with the original Package runtime primary World.
- Saves include selected World snapshots and their assets. Asset reference deletion protects both Work-default and historical Session World snapshots. Imported saves remain usable without the original Library resources.

## Validation actually executed

- Product service, Knowledge resolution/editor/browser focused checks passed; no unrelated full suite was run.
- Session Core and runtime projection FsEngine selection: 29 tests passed. Other database harnesses were deliberately excluded per the user's affected-surface/local-environment policy.
- HTTP, Library interactions/history, Package-original view and setup integration: 5 suites / 22 tests passed at that checkpoint. Final HTTP/Game World checks: 2 suites / 19 tests passed, including auth/ownership/token propagation and explicit primary World precedence.
- Final resource setup integration passed: default isolation, exact World/Knowledge replacement, stale-write rejection, unchanged-world progress preservation, reserved-state protection, historical revision access, fresh-directory save restoration with World attachment bytes, and attachment deletion protection.
- Real-host Playwright at 1440px and 390px passed: installed original → editable copy → add/edit/toggle/delete/review/save; parameter visibility; Work defaults affecting new starts; existing active Session detach/save and immediate runtime reload. Screenshots inspected and layout corrected from those observations.
- Changed JavaScript ESLint, zh-CN/zh-TW localization coverage and diff whitespace checks passed. Frontend prebuild command succeeded using its existing bundle cache; changed browser modules were exercised directly in E2E.
- Fresh fetch before integration confirmed the main baseline unchanged. Merge was conflict-free and its tree exactly matched the verified temporary branch. Main pushed, temporary local branch deleted; it was never pushed remotely. Docs retained.

## Usage limits

Package originals are not edited in place: create a copy, edit it, then explicitly select its revision for the Work or Session. Entry edits do not silently retarget pinned bindings. Replacing a World initializes that replacement's state; it is not an automatic state-schema migration. No Android/Docker build, paid model call or GitHub CI wait was needed.
