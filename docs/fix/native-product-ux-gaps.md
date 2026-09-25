# Atria Native Product UX / Capability Backlog

> Status: re-audited and normalized after the Product Frontend Redesign was integrated into `main`.
>
> Task branch: `fix/native-product-ux-audit`
>
> Verified baseline: `main@ad15c1e0c3e15e625ba163e284a300c00811f10d`
>
> Scope: current Atria-native product capability, authoring, runtime, portability, lifecycle, data-safety and recovery gaps.

## 1. Boundary

This backlog is for the current Atria product, not for preserving old SillyTavern user data.

**Do not add legacy user-data migration as a default requirement**, including old preset / World Info / other SillyTavern data conversion.

This does **not** prohibit migrating retained functionality.

If Atria still needs a capability currently implemented through SillyTavern-era extension/configuration/ABI code:

1. migrate or rebuild the required capability under the correct Atria Native/Core/Agents/Runtime authority;
2. switch active callers to the Native owner;
3. then remove the old implementation, old product surface and dead compatibility authority.

Do not keep dual-read, alias, dual-write or permanent compatibility ownership merely to preserve old user data.

## 2. Execution contract

The issue order below is the implementation order.

For each `NUX-xxx`:

1. verify it still reproduces on current `main`;
2. implement the complete fix;
3. add/update focused and adjacent tests;
4. remove the solved issue from this active backlog;
5. commit **code + tests + backlog removal** as one atomic commit;
6. continue directly to the next issue.

After completing one Group:

1. run that Group's full regression;
2. update necessary handoff/progress records;
3. push the working branch;
4. continue directly to the next Group.

Do not stop for routine failures. Stop only for required human device/UI validation, Secrets/accounts/permissions, or a newly discovered architectural conflict that changes an established product boundary.

## 3. Product constraints

- Current Atria UI, tokens, primitives and neighboring implementations are the visual authority.
- This is not a second frontend redesign.
- Do not rebuild Shell or create another local design system.
- Do not create a second router / persistence / settings / runtime authority.
- Preserve exact revision, Resource Graph, ChangeSet, Runtime Route, PackageVersion and Native Session semantics.
- New UI must reuse the nearest existing Atria picker/editor/destructive/remediation/sheet/confirmation/resource-relation pattern.
- Package originals remain read-only.
- Player Connections / Models / Secrets remain player-owned.
- Studio human/project writes continue through ChangeSet / Review / Apply.

## 4. Ordered work groups


# Group 1 — Completed

Implementation and validation: [completed work](native-product-ux-completed.md).

# Group 2 — Completed

Implementation and validation: [completed work](native-product-ux-completed.md).

# Group 3 — Completed

Implementation and validation: [completed work](native-product-ux-completed.md).

# Group 4 — Completed

Implementation and validation: [completed work](native-product-ux-completed.md).

# Group 5 — Completed

Implementation and validation: [completed work](native-product-ux-completed.md).

# Group 6 — Completed

Implementation and validation: [completed work](native-product-ux-completed.md).

# Group 7 — P1 — Portable Resources / Work / Session Lifecycle

**Group goal:** 统一资源便携、PackageVersion、Session、Save 与引用冲突的产品闭环。

All issues in this group are implemented and group regression passed.
Implementation and validation: [completed work](native-product-ux-completed.md).

# Group 8 — Completed

Implementation and validation: [completed work](native-product-ux-completed.md).
Dependency-first retirement: [ownership inventory](native-extension-retirement.md).

# Group 9 — P1 — Search / Localization / Final Closure

**Group goal:** 最后统一补全全局发现能力与产品汉化，并清理此次任务留下的死入口/死文案。

## NUX-044 — Atria product localization remains incomplete

**New finding / user-confirmed after frontend redesign**

**Current evidence**

The redesign added substantial zh-CN / zh-TW coverage, but Native product controllers still contain user-facing English that is either:

- not routed through localization at all;
- constructed dynamically before `translateShellText()`, so no stable locale key can match it;
- technical labels/diagnostics that remain English in normal product surfaces.

Examples include dynamic Runtime readiness/fallback summaries and multiple Native authoring/help/error strings.

**Impact**

Switching Atria to Chinese still produces mixed Chinese/English interfaces across Runtime, Library, Studio, Play, Plugins and error/recovery states.

**Acceptance**

- Audit every current Atria-owned product surface for untranslated user-facing text.
- Replace concatenated translation lookups with stable keyed/formatted localization.
- Complete zh-CN and zh-TW coverage for normal, loading, empty, validation, error and recovery states.
- Keep user-authored names, provider/model identifiers, paths and code literals untranslated.
- Add automated coverage that catches newly introduced Atria-owned hard-coded UI strings where practical.

**Evidence**

- `public/scripts/atria-shell/localization.js`
- `public/locales/zh-cn.json`
- `public/locales/zh-tw.json`
- `public/scripts/native/runtime-workspace.js`
- `public/scripts/native/library-workspaces.js`
- `public/scripts/native/studio-workspace.js`
- `public/scripts/native/play-controls.js`

---

---

# 5. Final completion criteria

The task is complete only when:

- every active `NUX-xxx` above has been implemented and removed from this file;
- each Group has passed its focused/adjacent regression before push;
- final lint, frontend build and required browser E2E pass;
- Native backup/restore/storage-migration data integrity is verified;
- Plugins follow the final Work Plugins / Global Plugins boundary;
- Global Plugins retain only Regex and Search Tools;
- Orchestrator and Memory are Agents-owned product capabilities, not plugin products;
- no new compatibility layer exists solely for old SillyTavern user-data migration;
- current Atria-owned product UI has complete intended localization coverage;
- final handoff records the branch/HEAD and validation evidence.

## 6. Re-audit basis

This backlog was verified against the frontend-redesign-integrated baseline:

`main@ad15c1e0c3e15e625ba163e284a300c00811f10d`

Before implementing any issue, current remote `main` remains authoritative if it has advanced since this audit.
