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

## NUX-037 — Save dependency recovery explains the problem but does not complete the recovery path

**Current evidence**

When a `.atriasave` requires a missing/mismatched exact Package, Play/Library explains that the matching Work must be installed first.

There is no direct “install/open matching Work” recovery action from the same flow.

**Acceptance**

Provide a direct recovery path into Package install/version resolution while preserving exact hash/version verification.

---

---

## NUX-038 — Native Sessions support displayTitle but cannot be named/renamed normally

**Current evidence**

Session contracts and `startWork()` support `displayTitle`.

Work/Play **Start New** does not ask for a title, and no normal rename/update endpoint/product action was found.

**Acceptance**

Allow optional naming at creation and rename later without changing Session identity, history or PackageVersion pin.

---

---

## NUX-039 — Play branch/revision history is still raw JSON

**Current evidence**

Timeline renders “Branches & revisions” by `JSON.stringify` into a `<pre>`.

**Acceptance**

Provide a readable branch/history model showing current branch, fork points and revision relationships. Raw payload stays under Details/Diagnostics.

---

---

## NUX-040 — Reference-safe failures do not consistently become resolution flows

**Current evidence**

Backend deletion/authoring guards can know exact blockers and the Resource Graph can resolve reverse references.

Product surfaces usually stop at “still referenced” / conflict text.

**Acceptance**

Convert blockers into navigable Used By rows and legal remediation actions instead of leaving the user at a dead end.

---

---


# Group 8 — P1 → P2 — Plugin Hard Cut

**Group goal:** 形成 Work Plugins / Global Plugins 的 Atria 插件模型，并在依赖迁移后物理退役其余 SillyTavern extension 产品。

## NUX-041 — Plugins still use the wrong product taxonomy

**Current evidence**

The current Plugins utility mixes two different systems:

1. **Native Plugins** projected from installed Work/Package manifests.
2. An **Advanced · Legacy extensions** area that embeds SillyTavern extension settings and exposes the Legacy Extension Manager / install flow.

The codebase also still contains many upstream-style built-in extensions under `public/scripts/extensions/`.

At the same time, Orchestrator and Memory are already first-class product capabilities under **Agents**:

- Agents → Orchestration
- Agents → Run
- Agents → Memory
- Agents → Diagnostics

They should not remain conceptually duplicated as plugins.

**Target product taxonomy**

### Work Plugins

Plugins shipped as part of an Atria Work / `.atria` Package.

Ownership and lifetime are tied to:

- Package;
- exact PackageVersion;
- declared capabilities;
- explicit permissions;
- Package Runtime.

These are not globally installed SillyTavern extensions.

### Global Plugins

User-level Atria capabilities independent of a Work.

For the current product direction, retain only:

- **Regex**
- **Search Tools**

as first-class Global Plugins.

### Not Plugins

The following are first-class Atria product domains/capabilities and must not appear as plugin products:

- Orchestrator / agent orchestration;
- Memory / Memory Graph.

They belong exclusively under **Agents**.

**Impact**

Keeping the old extension model makes Atria look like a themed SillyTavern extension host instead of an independent product. It also creates duplicate ownership and settings surfaces.

**Acceptance**

- Replace the current Native + Legacy extension product model with **Work Plugins / Global Plugins**.
- Work Plugins come only from installed Work/Package runtime declarations.
- Global Plugins initially contain only Regex and Search Tools.
- Remove Orchestrator and Memory from all plugin/extension management presentation; Agents is their sole product home.
- Remove the Legacy Extension Manager and embedded SillyTavern extension settings from the normal Atria Plugins domain.
- Do not allow legacy extension installation to remain a normal Atria product workflow.
- Plugin permissions/status/dependencies must be managed according to the new Work/Global ownership model.
- Keep opaque IDs and technical contribution payloads behind Details rather than as the primary identity.

---

---

## NUX-042 — Retire the remaining SillyTavern extension/plugin inventory from the Atria product line

**New user-directed hard-cut requirement**

**Current evidence**

`public/scripts/extensions/` still contains a broad upstream-style extension inventory, including examples such as:

- assets / attachments;
- caption;
- expressions;
- gallery;
- quick-reply;
- stable-diffusion;
- token-counter;
- translate;
- tts;
- vectors;
- connection-manager;
- completion/character assistant extensions;
- Orchestrator / Memory implementation modules;
- Regex;
- Search Tools;
- shared extension infrastructure.

Not every directory is safe to delete immediately: some are currently implementation dependencies for retained Atria capabilities. For example, Memory embedding/rerank still relies on Connection Manager today, and Orchestrator/Memory source currently lives under the historical `extensions/` tree even though their product ownership has moved to Agents.

**Required end state**

The Atria product should no longer carry a general SillyTavern built-in-extension catalog.

Retained plugin products are only:

- **Global Plugin: Regex**
- **Global Plugin: Search Tools**
- **Work Plugins:** Package-declared Native runtime plugins

Orchestrator and Memory remain retained functionality, but as Agents-owned Atria modules rather than plugin products.

All other extension products are to be retired from Atria.

**Implementation constraint**

“Delete all other plugins” is a **physical cleanup target**, not permission to blindly remove directories before dependency replacement.

For every candidate extension:

1. build an import/runtime dependency graph;
2. decide whether the functionality is:
   - obsolete and removable;
   - still required by an Atria core/domain and therefore must be migrated into that domain;
   - shared infrastructure that must be renamed/relocated before the old extension shell is removed;
3. remove its UI/settings/registration/product surface;
4. migrate any still-required data/config authority;
5. delete dead source, styles, templates, tests, docs and settings keys;
6. add residual guards so deleted extensions cannot silently return through upstream merges.

Examples of required dependency-first handling:

- Memory embedding/rerank must stop depending on Connection Manager before Connection Manager can be removed.
- Orchestrator/Memory implementation may be relocated out of the legacy extension hierarchy only after imports/tests are updated; their functionality is retained under Agents.
- Game/runtime/shared support code that happens to live under `extensions/` must not be deleted merely because of its directory name; migrate retained core functionality to Atria-owned modules first.

**Acceptance**

- Normal Atria has no Legacy Extension Manager.
- No general third-party SillyTavern extension install flow is exposed.
- Regex and Search Tools are the only first-party Global Plugins.
- Package-declared Work Plugins are isolated from Global Plugins.
- Orchestrator and Memory appear only under Agents.
- Every other retired extension has no active registration, settings UI, persisted authority or reachable product route.
- Dead extension code is physically removed after dependency migration.
- Architecture/residual tests enforce the retained-plugin allowlist.

**Evidence**

- `public/scripts/atria-shell/utility-workspaces.js`
- `public/scripts/extensions/`
- `public/scripts/atria-shell/workspace-host.js`
- `tests/e2e/atria-shell/07-plugins-settings.e2e.js`

---

---


# Group 9 — P1 — Search / Localization / Final Closure

**Group goal:** 最后统一补全全局发现能力与产品汉化，并清理此次任务留下的死入口/死文案。

## NUX-043 — Global Search coverage and completeness signaling are incomplete

**Current evidence**

Product Search indexes Works, Worlds, Knowledge Bases, Build Projects, Runtime configuration and Prompt/Generation resources.

It does not index several major user entities, including Sessions, SavePoints, Skills, individual Knowledge entries and orchestration configurations.

Search refresh uses `Promise.allSettled`; failed authorities can disappear from the result set while the UI still looks complete.

**Acceptance**

Define supported global-search domains, include major navigable user entities, and show a lightweight “some results unavailable” state with retry/details when a source fails.

---

---

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
