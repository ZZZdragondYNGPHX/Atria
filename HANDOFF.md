# Atria 原生 Package Runtime — Live Handoff

## 当前真实状态

- Task ID：`ARCH-NATIVE-PACKAGE-RUNTIME`；Primary Workspace：`main` 产品，文档属于独立长期 `docs`。
- 阶段：S0–S3 完成；CP1 核心运行闭环已验证并推送，当前停止，S4 尚未开始。
- 产品开发分支：`feat/native-package-runtime`；HEAD `10b003f9a2001145b14ae4a40cc731d443ac04d1`。
- main 基线：`4ac8affbf01bfb5fb576834bb7eedbeefd03c007`；未合并本任务。
- S2 产品提交：`664616b83`；S3 产品提交：`10b003f9a`。
- S1 docs：`ac1cea354`；S2 docs：`b6216a882`；S3 文档 HEAD 以实际远端 `docs` ref 为准。
- Plan 唯一入口：[index.md](plans/architecture/native-package-runtime/index.md)。
- Record：[native-package-runtime.md](records/architecture/native-package-runtime.md)。

## 已完成

S1 冻结固定 computation、获准读取、typed computed + 固定 Effect、前后检查、单 Session CAS、Task uses / production 契约。S2 复用编译闭包 / QuickJS，Domain precondition / compute / invariant 强制在私有候选执行，固定效果和 publications 后检查，Receipt 保留安全资源依据。

S3 贯通正式 Task 生产/消费、跨 Revision 依赖与 Scope、once 原子采用；获准动态 Context / Knowledge 进入原 Compiler / PromptIR，完整 Knowledge selector 处理展开文本、依赖、full / compact、资格、优先级和预算。现代 Task/Turn 的知识选择状态随正式结果 CAS 采用，按受众 targets 隔离；preview / compile 保持只读。

CP1 本机 HTTP fixture 场景贯通真实 Task → 无关 Revision → 购买规则 → Narrator → 单次 CAS，付款/库存/物品/once 一起成立，重复请求不重复扣款。相关行为与回归验证详情在 Record。

## 当前决策与限制

- Package 定义玩法，Authority 强制平台和固定领域规则；脚本没有正式提交句柄。
- 新的 Task uses 只接受 durable 未采用 artifact，不能并用旧 applyCommand / interpretation；原局部 Prompt JSON artifacts 不是正式 Task 身份。
- 不引入插件兼容、平行 State / Authority / 调度 / 事实缓存。没有读取 reference。
- QuickJS deadline 不是整个宿主进程 wall-time SLA；原子边界只到单 Session，跨 Realm / 外部系统未证明。
- 细致 Experience / Lifecycle、Processing、Studio 表单/视觉 Diagnostics 和最终集成留到 S4–S6。

## 实际验证

新增 S3 21 例、S2 领域计算和提交场景，以及对应 Context / Knowledge / Task / Prompt / Session / Authority 回归已本地通过；最后 tokenizer 增量的 CP1 + Prompt 48 例通过。触及产品文件 ESLint、diff whitespace、文档 UTF-8 / 相对链接通过。没有执行远端 CI、全库测试、构建、浏览器 UI、Android / 真机。MySQL / PostgreSQL 本机没有启动，未算通过。

## 本地工作树保护

本轮保留了产品工作树 `AGENTS.md` 的原有未提交变更，以及既有 docs 工作树 README / WEB-PERSISTENT-PROMPT / templates 的原有 dirty 调整；这些未进入任务提交。任务文档使用以最新 origin/docs 为起点的独立工作树，未将 main merge 到 docs。其它 worktree 与旧任务分支未改动。换设备时以远端 refs 为准；此设备继续时先检查 dirty changes，不覆盖上述调整。

## 下一目标：S4 → S5 到 CP2

用户任务约定优先于默认逐阶段停止：每阶段执行本地最小相关验证，更新 Plan / 同一 Record / 本 HANDOFF 并推送，连续到 CP2（S5 后）才停止；之后续接 S6 到 CP3。不主动跑远端 CI。

开始前必读顺序：真实 Git / 远端状态与当前工作区规则 → docs Governance → 本 HANDOFF → [Plan index](plans/architecture/native-package-runtime/index.md) → [decisions](plans/architecture/native-package-runtime/decisions.md) → S4 的 [experience-processing](plans/architecture/native-package-runtime/experience-processing.md) 编排部分、[context-generation](plans/architecture/native-package-runtime/context-generation.md)、[authoring-diagnostics](plans/architecture/native-package-runtime/authoring-diagnostics.md) → 当前 [Record](records/architecture/native-package-runtime.md)。S5 到达时再按 index 读对应部分。

不要重做定向研究、S1 技术冻结、S2 / S3 实现，不扫描全部 Plans / Skills / reference。沿用同一产品分支，仅读当前编排依赖的 Authority / Generation / Lifecycle / Experience 路径，保护现有资源与配置兼容性。main 集成和分支清理留到 S6。

## 新对话接手提示词

> 继续 ARCH-NATIVE-PACKAGE-RUNTIME，从 CP1 后的 S4 Experience / Lifecycle 编排连续推进 S5 Processing / 作者工作流，到 CP2 后停止。先核对真实 main / docs / feat/native-package-runtime 和 dirty changes，按 docs:HANDOFF.md → Plan index → S4 指定模块 → 同一 Record 读取。CP1 产品 HEAD 为 10b003f9a2001145b14ae4a40cc731d443ac04d1，main 基线仍为 4ac8affbf01bfb5fb576834bb7eedbeefd03c007。S1–S3 已实现验证并推送，不重做；复用固定 Package computation、Task uses / production、Knowledge 选择与 result-adoption proof、现有 SessionCore CAS。每阶段仅执行本地最小相关验证，更新 Plan / Record / HANDOFF 并推送，不主动运行远端 CI；只到 CP2 停下。用户只把控范围、职责边界和关键取舍，技术细节自行推导。不要提前合并 main，S6 才最终集成和清理。
