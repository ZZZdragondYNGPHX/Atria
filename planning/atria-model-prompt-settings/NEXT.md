# NEXT：P1 — Native Resource & Persistence Foundation

## 当前状态

P0 — Baseline / Contracts / Guard Evolution 已完成并验证。

- Repository: `ZZZdragondYNGPHX/Atria`
- main baseline: `2d1c3ec9c8039ecc4728ebe712f4a9f14186906f`
- work branch: `refactor/atria-model-prompt-settings`
- P0 validated HEAD: `472e1a9f0759a460d845a2e6c618983c35e18654`
- P0 workflow: Model Prompt Runtime P0 Checks #6
- P0 run: `35832249672`
- P1–P8 尚未实施。
- 不要创建新分支，不要合并 main。

开始前必须重新 fetch 远端工作分支。若其他会话已推进，保留其提交，不得回退到 P0 HEAD。

## 下一阶段

只执行：

**P1 — Native Resource & Persistence Foundation**

不要提前执行 P2–P8。

## P1 目标

建立 Native Prompt / Generation / Connection / Model / Route 的唯一持久化真源，并严格复用 A1/A2。

### 必做

1. 建立 generic versioned JSON resource handler/seam，承载：
   - `core.prompt-module`
   - `core.prompt-program`
   - `core.generation-profile`
2. 接入现有 A2 Resource Registry / derived-readonly Resource Graph。
3. 接入 NativeLibraryService：
   - list
   - get exact
   - immutable revision identity
4. 接入 LibraryAuthoring：
   - Attach
   - Fork
   - Update
5. 接入 Package dependency closure，所有依赖使用 exact revisions，缺依赖 fail closed。
6. 建立 player-owned persistence：
   - Connection Profile
   - Model Profile
   - Runtime Route
7. Secret persistence 只保存 `secretRef`，不得保存 secret value。
8. 保持 project/library/package origin/provenance。
9. Studio 写入继续通过 A1 Authoring Operation / Workspace / ChangeSet。
10. Project Agent 继续通过 Registry / Graph / A1 authority 动态发现能力。

## P1 红线

- 不创建 PromptStore / GenerationStore / 第二个 Library。
- 不创建第二套 Resource Graph。
- 不重写 WorldRepo / KnowledgeRepo / AssetStore。
- Resource Graph 仍 derived-readonly。
- 不实现 Generation Service.execute；这是 P2。
- 不实现 Prompt Compiler；这是 P3。
- 不切 first-party generation；这是 P4。
- 不切 Runtime UI；这是 P5。
- 不修改 A6/A8 replacement gates。
- Package 不得持有 private Connection / Model / concrete Runtime Route / Secret value。
- 不读写 `package.presets` 作为 Native runtime authority。
- 不新增 Native Core → ST globals/DOM/PresetManager/PromptManager 依赖。

## P1 验证

至少覆盖：

- generic resource schema / revision round-trip；
- exact refs 不追 latest；
- same-name different IDs 不冲突；
- Library list/get exact；
- Attach/Fork/Update；
- Resource Graph forward/reverse refs；
- Package closure dependency inclusion；
- missing exact dependency fail closed；
- delete safety / reverse ref behavior；
- Connection/Model/Route persistence；
- secret value never serialized；
- project/library/package origin/provenance；
- relevant A1/A2/A7/A8 guards；
- P0 architecture guard；
- focused ESLint。

Android / Docker 默认不运行。

## 开始前读取

1. `main:AGENTS.md`
2. `main:FORK_MAINTENANCE.md`
3. `docs:handoff/latest-handoff.md`
4. `docs:refactor/atria-model-prompt-settings.md`
5. `docs:planning/atria-model-prompt-settings/README.md`
6. `DESIGN.md`
7. `EVIDENCE.md`
8. `IMPLEMENTATION.md`
9. 本文件
10. P0 implementation:
    - `src/native/model-prompt-runtime/contracts.js`
    - `src/native/model-prompt-runtime/ports.js`
    - `tests/native/model-prompt-runtime-contracts.test.js`
    - `scripts/check-p0-model-prompt-runtime-architecture.mjs`
11. Existing A1/A2 seams:
    - `src/native/authoring/resource-registry.js`
    - `src/native/authoring/resource-graph.js`
    - `src/native/authoring/library-service.js`
    - `src/native/authoring/library-authoring.js`
    - `src/native/dependency-closure.js`
    - `src/native/authoring/studio-service.js`

## 不要重复

- 不重新设计六个核心对象。
- 不重做 P0 contracts / ports / identity families。
- 不重新命名 `runtime.modelPrompt`。
- 不重做 P0 guard。
- 不重做 N0–N10 / A0–A9。
