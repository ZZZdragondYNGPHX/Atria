# Atria Native Experience Modes & Capability Deepening — Plan Index

- Task ID: `feat/native-experience-modes-capability-deepening`
- Primary Workspace: `main`
- Status: Implementation Baseline v1.0; P0–P9 design/implementation material retained. Use current Records and remote refs for factual execution state.

## Goal

Build one shared Native Experience Capability Layer for Component / Hybrid / Full while keeping layout ownership separate from authority and capability.

## Frozen core principles

- `Component / Hybrid / Full` are layout-ownership modes, not capability tiers.
- Typed authority only; no arbitrary state-patch authority.
- Package presentation does not gain arbitrary browser, DOM, host, filesystem or network authority.
- Prompt, display and authoritative state remain distinct.
- Existing Native Session / World / Revision / Branch / Knowledge / Memory / Model-Prompt authorities remain the facts of record.
- Legacy SillyTavern/MVU examples are capability evidence, not API-design authority.

## Module map

| Module | Authority | Depends on |
| --- | --- | --- |
| `baseline.md` | Implementation baseline, 32-capability table, P0–P9 map, goals and core principles | — |
| `experience-model.md` | Experience modes, primitives, local UI, expressions, actions, opening, projection/MVU-native direction | `baseline.md` |
| `boundaries-history.md` | Legacy absorption limits, runtime/security boundaries, superseded early discussion | `baseline.md` |
| `round-2-ledger.md` | Early capability inventory | `baseline.md` |
| `component-model-v2.md` | Component Model v2 detailed discussion | `experience-model.md` |
| `taiko-audit.md` | Heavy-frontend MVU case audit | `experience-model.md` |
| `message-projection.md` | Turn Envelope / Message Projection | `baseline.md` |
| `capability-gap-analysis.md` | Consolidated benchmark gap analysis | `baseline.md` |
| `case-01-hanhai.md` | Activity/media/asset/background-task stress test | `capability-gap-analysis.md` |
| `case-02-tianshu.md` | Action/activity/add-on stress test | `capability-gap-analysis.md` |
| `case-03-yinqi-a.md` … `case-03-yinqi-e.md` | Large-session/model-task/perspective/authority stress test; split only for reading size | `capability-gap-analysis.md` |
| `case-04-zhushen-space.md` | Shared-runtime stress test | `capability-gap-analysis.md` |
| `case-05-cult-leader.md` | Final pressure test / productization evidence | `capability-gap-analysis.md` |
| `revision-log.md` | Historical Plan revisions | — |

## Stage routing

| Stage | Required modules | Load only when needed |
| --- | --- | --- |
| P0 — Contract Foundation & Regression Fence | `index.md`, `baseline.md`, `boundaries-history.md` | `capability-gap-analysis.md` for contract rationale |
| P1 — Component v2 / Form / Local State / Action / Opening | `index.md`, `baseline.md`, `experience-model.md`, `component-model-v2.md` | `taiko-audit.md` |
| P2 — Message Projection / Conversation / Branch Presentation | `index.md`, `baseline.md`, `message-projection.md` | `experience-model.md` |
| P3 — Turn / Model Task / Auxiliary Operation Runtime | `index.md`, `baseline.md`, `capability-gap-analysis.md`, `case-03-yinqi-a.md` | case studies only for disputed rationale |
| P4 — Session Application / Temporal / Automation / Experience Workflow | `index.md`, `baseline.md`, `capability-gap-analysis.md`, `case-03-yinqi-a.md` | `case-02-tianshu.md` |
| P5 — Activity / Media / Scene / Asset / Host Capability | `index.md`, `baseline.md`, `case-01-hanhai.md`, `case-02-tianshu.md` | `capability-gap-analysis.md` |
| P6 — Data Projection / Perspective / Scoped Information / Narrative Rollup | `index.md`, `baseline.md`, `message-projection.md`, `case-03-yinqi-a.md` | later Case 03 parts when exact authority/streaming rationale is needed |
| P7 — Add-on / Community / Continuity / Cross-Authority Transfer | `index.md`, `baseline.md`, `case-02-tianshu.md`, `case-04-zhushen-space.md` | `capability-gap-analysis.md` |
| P8 — Shared Session & Realm Runtime | `index.md`, `baseline.md`, `case-04-zhushen-space.md` | Case 03 only for shared authority constraints |
| P9 — Studio / Health / Productization / Final Integration | `index.md`, `baseline.md`, `capability-gap-analysis.md`, `case-05-cult-leader.md` | exact domain module being regressed |

Do not load all case studies by default. The baseline is the normative implementation entry; case studies explain why particular capabilities were frozen.

## Material routing/design changes

- **2026-09-30 — Plan Bundle migration:** the former monolithic Plan was split by its existing authority/discussion boundaries. No frozen product decision was intentionally changed.
