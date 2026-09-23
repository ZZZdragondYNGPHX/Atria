# NEXT：P0 — Baseline / Contracts / Guard Evolution

## 当前状态

- 设计：已封板。
- 产品代码：尚未开始本 refactor 的实现。
- 当前集成基线：`main@2d1c3ec9c8039ecc4728ebe712f4a9f14186906f`
- 正式实现分支：`refactor/atria-model-prompt-settings`
- 正式总纲：`refactor/atria-model-prompt-settings.md`
- 详细设计：本目录 README / DESIGN / EVIDENCE / IMPLEMENTATION。
- N0–N10 / A0–A9：继续作为 frozen semantic foundations。

实现分支已从上述 current main 创建。开始任何代码修改前必须重新 fetch 远端分支；如果别的会话已经继续推进，以远端实际最新 HEAD 为准，不得回退到创建时基线。

## 下一阶段

只执行：

**P0 — Baseline / Contracts / Guard Evolution**

不要提前执行 P1–P8。

## P0 目标

1. 再核对当前工作分支与 main 是否出现新提交。
2. 将最终设计落成 Native contracts：
   - Connection Profile
   - Model Profile
   - Generation Profile
   - Prompt Module
   - Prompt Program
   - Runtime Route
   - RequestContextPlan
   - Prompt IR
   - EffectiveRequestSnapshot
3. 冻结 capability supported/unsupported/unknown + provenance。
4. 冻结 package runtime metadata 的新结构；不要扶正 `package.presets`。
5. 冻结 Port contracts：
   - Generation Service
   - Route Resolver
   - Provider Port
   - Secret Port
   - Context Provider
6. 建立本 refactor 的 architecture/residual guard skeleton。
7. 建立 frozen-guard evolution matrix：
   - A6 Advanced Connection compatibility；
   - A6 standalone Capabilities route；
   - A8 Studio Agent `generateTask`。
8. P0 不提前切 UI/Runtime，不删除旧 seam。

## P0 红线

- 不创建新分支。
- 不合并 main。
- 不重做 N0–N10 / A0–A9。
- 不创建第二套 Session / Project / Library authority。
- 不让 Prompt 直接获得持久状态写权限。
- 不让 Package 保存用户 Secret / private Connection。
- 不建立 PromptStore / second Resource Graph。
- 不把 `Atria.getContext()` 定义成新 Core 的必需依赖。
- 不为了新 contract 大规模重写 provider sender。
- 不通过删掉 frozen guard 来消除冲突。

## P0 验证

至少需要：

- contract unit tests；
- invalid scope/identity refs；
- secret redaction/serialization tests；
- package private-runtime rejection；
- capability tri-state/provenance tests；
- architecture guard syntax + behavior；
- relevant A0–A9 / N0–N10 frozen guards；
- focused ESLint；
- broader checks只报告实际执行项。

Android / Docker 不运行，除非用户另行明确要求。

## P0 完成后的动作

完成并验证 P0 后必须停下。

更新：

- `docs:planning/atria-model-prompt-settings/`
- `docs:refactor/atria-model-prompt-settings.md`
- `docs:handoff/latest-handoff.md`

记录：

- 工作分支 live HEAD；
- P0 commits；
- tests/checks；
- frozen guard evolution matrix；
- 未完成 P1–P8；
- P1 目标。

然后给用户 **P1 新对话提示词**，不得在同一轮直接继续 P1。

## 新对话接手摘要

新对话启动时依次读取：

1. `main:AGENTS.md`
2. `main:FORK_MAINTENANCE.md`
3. `docs:handoff/latest-handoff.md`
4. `docs:refactor/atria-model-prompt-settings.md`
5. `docs:planning/atria-model-prompt-settings/README.md`
6. `DESIGN.md`
7. `EVIDENCE.md`
8. `IMPLEMENTATION.md`
9. 本文件

然后 fetch `refactor/atria-model-prompt-settings`，以实际远端 HEAD 为准，只执行 P0。
