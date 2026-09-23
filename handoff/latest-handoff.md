# Active checkpoint: Native Authoring Platform A5 complete; ready for A6

## Status

**Atria Native Authoring Platform & Product Frontend Refactor has completed A5 — Plugin & Skill Platform.**

Prior Native Content & Session Architecture N0–N10 remains complete and frozen. A0–A4 remain frozen and validated.

- Repository: `ZZZdragondYNGPHX/Atria`
- Stable baseline: `main@fd9a493c9040b32f4892bd92531030e58b066244`
- Implementation branch: `refactor/atria-native-authoring-platform-product-frontend`
- A0 validated HEAD: `1e7d32ac74411e98a5003be72c5dc06d8d72966e`
- A1 validated HEAD: `bf09c79e07204ee39303e52e89a3da3b2f7617da`
- A2 validated HEAD: `8510e423a3faf492340fabc32a612d4796a875e3`
- A3 validated HEAD: `ba1ba05e0cd53b0947be34bed62707a297d97ac2`
- A4 validated HEAD: `b68e7ee930c869b5a8a118faf22ef4e38e35cb87`
- A5 validated HEAD: `eefd6550d9b2af6c2777984e12d5f61de0898415`
- Formal plan: `refactor/atria-native-authoring-platform-product-frontend.md`
- Detailed handoff: `handoff/atria-native-authoring-platform-product-frontend.md`
- Next phase: **A6 — Native Product Frontend**
- Continue on the same implementation branch. Do not create a new branch and do not merge `main`.

Formal plan design did not change during A5; no mechanical plan edit was required.

## A5 implemented

### Plugin manifest / API

A5 formalized the Atria Plugin permission, dependency, Host capability, package-runtime capability and contribution contracts.

Exact dependencies are dependency-first and fail closed for missing dependencies, version mismatch and cycles.

### Host Plugin boundary

Executable Host Plugin code runs only behind the new explicit Host Plugin boundary.

Host API access is capability/permission gated. Plugin authoring writes are forced through the existing Authoring Operation → Workspace → ChangeSet path with Plugin origin.

The boundary does not expose PackageRepo / SessionRepo / WorldRepo / Branch / Timeline authority.

Legacy SillyTavern-style server plugins remain an isolated legacy/internal system and are not the new Atria Plugin standard.

### Contribution Registry / Resource Registry

A5 added a contribution registry for Build/Play surfaces.

Plugin-defined authoring resource types reuse the existing A2 Resource Registry as `plugin-source` resources rather than creating a second registry/persistence authority.

### Package runtime v1

Package runtime remains declarative/capability-defined only.

Build validates package plugin dependency/capability/permission closure and rejects executable Host Plugin entrypoints from package runtime.

Runtime Descriptor projects only exact PackageVersion plugin identities and declarative Play contributions.

The A4 Experience Runtime consumes these contributions through a package contribution registry; declarative `play.selector` contributions compile into the existing selector runtime.

### Native Skill scopes

Native Skill scope is:

- global
- project
- package

The Skills repository now supports project/package persistence scopes, and the Native resolver uses global → project → exact PackageVersion precedence.

Character scope remains only in legacy chat/orchestration compatibility paths and is not a Native authoring identity.

## A5 validation

Validated at `eefd6550d9b2af6c2777984e12d5f61de0898415`.

### Native Authoring Platform A5 Checks #2

- Run: **35809294986**
- focused + adjacent regressions: **16 suites / 145 tests passed**
- A5 residual guard: **success**
- A5 guard syntax: **success**
- frozen A0/A1/A2/A3/A4 guards: **success**
- focused ESLint: **success**
- full root lint: **success**

Independent frozen workflows on the same HEAD:

- **A0 Checks #92**, Run **35809294999** — success.
- **A1 Checks #79**, Run **35809294967** — success.
- **A2 Checks #77**, Run **35809295009** — success.
- **A3 Checks #43**, Run **35809294982** — success.
- **A4 Checks #11**, Run **35809294981** — success.

## Key decisions

- Plugin and Skill remain separate capability classes.
- Host Plugin and Package Runtime have different trust/execution identities.
- package-runtime v1 has no arbitrary JS execution.
- Plugin authoring has no privileged write path.
- Resource Registry / Package / Session / Branch / Timeline / World authorities remain unchanged.
- Native Skill identity does not include Character.
- A4 Experience Runtime remains the shared Text / Component / Hybrid / Full dispatcher.
- Formal plan remains unchanged.

## Explicitly not started

A5 deliberately did not implement:

- A6 Native Product Frontend;
- A7 Studio Authoring UX;
- A8 Project Agent / Vibe Coding;
- A9 final hard-cutover cleanup.

## Next action — A6 only

Start **A6 — Native Product Frontend** from the actual latest remote HEAD of the same implementation branch.

Before editing, re-read:

1. `main:AGENTS.md`
2. `main:FORK_MAINTENANCE.md`
3. this latest handoff
4. `docs:refactor/atria-native-authoring-platform-product-frontend.md`
5. `docs:handoff/atria-native-authoring-platform-product-frontend.md`
6. A5 Plugin & Skill Platform implementation/tests/guard
7. A4 Experience Runtime
8. current Atria shell, navigation, route/search and product frontend foundations.

A6 must implement only the frozen Native Product Frontend, consuming A0–A5 Native authorities. Do not create a competing persistence/runtime authority, do not start A7/A8/A9 early, do not create a new branch, and do not merge `main`.

Stop after A6 validation/handoff.
