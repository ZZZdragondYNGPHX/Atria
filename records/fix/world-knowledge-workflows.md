# World and Knowledge workflow repair

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

Status: complete, 2026-09-25. Main: `23bfdc608b5e5ee2b6b863f116d118d529b0bab9`.
Implementation: `45f0fdbd56dac8dd46e80431b3cd094eb67a34ea`.
Baseline: `aa3a0b0dcfbfc451c696990794ccf16390e7fba3`.

## Delivered behavior

- Installed originals and Library World/Knowledge details have a prominent **Create editable copy** action using the existing exact dependency bundle import. Originals remain immutable.
- Library Knowledge details expose **Add entry**, **Edit entry**, **Delete entry** and an enabled checkbox. Edits remain detached drafts until Review/Save publishes an immutable revision. Referenced entries cannot be removed without resolving their entry relations. Adding to an empty base does not invent an extra blank entry.
- Named read-only parameters show discovery, conditions, probability, sticky/cooldown/delay, placement, priority, visibility, target, budget and relations. The editor opens common groups and uses a desktop list/detail layout with compact field grids; narrow screens retain stacked controls. World baseline values have named rows; raw schema/identity remain inspectable details.
- Work details expose **Configure Worlds & Knowledge** for each starting point. Existing Sessions expose **Manage → Worlds & Knowledge** in My Games. Resource rows use a checkbox and revision selector; exact IDs are secondary details. Users may detach Package defaults and select Library copies/revisions.
- Saving choices for the currently open Session reloads its runtime projection immediately. Generation must be stopped before changing that active Session's resource choices.

## Native authority and state decisions

- Updating a Work version does not silently apply defaults made for another version.
- Selected Worlds are exact snapshots in revision-backed `atri_world_selection`. Generic runtime writes cannot mutate this reserved namespace. Timeline and prior revisions remain recoverable.
- Optional `packageBindingIds` in the existing KnowledgeBindingSet records explicit Package binding selection. Absent selection preserves the old exact-default contract. Selected Package bindings retain authored policy; chosen Library Knowledge is copied into Session-owned exact snapshots, independent of later Library changes.
- Resource changes publish one Session revision using expected HEAD, clear derived Knowledge lifecycle state, and preserve immutable history. Game World resolution respects explicit Session World selection instead of overriding it with the original Package runtime primary World.
- Saves include selected World snapshots and their assets. Asset reference deletion protects both Work-default and historical Session World snapshots. Imported saves remain usable without the original Library resources.

## Usage limits

Package originals are not edited in place: create a copy, edit it, then explicitly select its revision for the Work or Session. Entry edits do not silently retarget pinned bindings. Replacing a World initializes that replacement's state; it is not an automatic state-schema migration. No Android/Docker build, paid model call or GitHub CI wait was needed.
