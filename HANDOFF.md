# Atria 原生 Package Runtime — Live Handoff

## 当前任务

- Task ID: `ARCH-NATIVE-PACKAGE-RUNTIME`。
- Primary Workspace: `main`；Plan / Record / HANDOFF 在长期 `docs`。
- 当前阶段：S1 技术契约已冻结；继续 S2 → S3，抵达 CP1 后停止汇报。
- 产品基线：远端 `main`，`4ac8affbf01bfb5fb576834bb7eedbeefd03c007`。
- 文档发布目标：远端 `docs`；本轮使用以 `origin/docs` 为起点的独立工作树。起点 `5104ee5ef78f65a75194f2894d8b4ac935744c89`，发布后的文档 HEAD 以实际远端 `docs` ref 为准。
- 产品开发分支：S1 尚未创建；S2 使用 feat/native-package-runtime。
- Plan 唯一入口：[index.md](plans/architecture/native-package-runtime/index.md)。
- Record：[native-package-runtime.md](records/architecture/native-package-runtime.md)。

## 已完成与方向

定向研究和方向讨论完成，已形成 Atria 自己的原生能力模型。冻结决策位于 [decisions.md](plans/architecture/native-package-runtime/decisions.md)，后续不重新从插件 API 或兼容需求出发。

Package 定义玩法，Atria 强制固定领域规则和平台合法性。脚本计算/编排、提出操作或候选结果，Authority 提交正式状态。State 按归属和用途授权；Prompt / Knowledge 只读派生；模型工作显式 Task；Task 保留来源并按契约消费；Processing 按阶段和用途转换，正式采用经对应 Authority。

用户只把控能力范围、职责边界和关键取舍。字段、事件、接口和执行策略由 Agent 推导，不逐项要求确认。

## 验证状态

- 研究是源码静态追踪，没有执行产品测试、构建或运行时复现。
- 发布前已重新 fetch main / docs，main 基线未变化；正式企划提交 `03e52f7eaa2727ae1fc8c4b094a6be76b1432272` 已经远端 `docs` ref 核验，远端 main 仍为上述基线。
- 文档发布检查已通过：9 份文档、33 个相对链接、27 个 main 代码入口及 UTF-8 编码；`git diff --cached --check` 通过。远端 refs 为事实依据。

## 下一目标：S2 → S3，至 CP1 停止

首先在 S1 基于最新 main 冻结固定 Package Domain Authority 的可实施技术契约：规则资源绑定、读授权、受限执行、Precondition / Logic / Effect / Invariant、候选范围、提交及必要 Task 产物引用，并给出行为验证矩阵。S1 只读相关源码并更新设计文档，不实现产品、不创建产品开发分支。

S1 验证和推送后继续 S2，按 Governance 建立产品短期分支，实施受限业务逻辑与 Authority；S2 完成验证和推送后继续 S3，贯通动态上下文、Knowledge 主链与 Task 产物消费。S3 完成后到达 CP1，汇报核心闭环、实际验证、关键风险和下一目标，然后停止。

用户于 2026-10-06 明确调整本任务停点：各阶段更新 Plan / Record / HANDOFF 并照常推送，只有 CP1（S3 后）、CP2（S5 后）和 CP3（S6 最终完成）停止汇报。本任务级约定优先于 Governance 默认逐阶段停止规则。后续从 CP1 续接 S4 → S5 到 CP2，再从 CP2 续接 S6 到 CP3；具体条件见 [Plan index](plans/architecture/native-package-runtime/index.md)。本轮仅发布 S0 文档，尚未启动后续阶段。

## 开始前必读顺序

1. 当前工作空间规则与 `docs:README.md` Governance；检查真实 Git / 远端状态和无关 dirty changes。
2. 本 `docs:HANDOFF.md`。
3. [Plan index](plans/architecture/native-package-runtime/index.md)。
4. S1 必读：[decisions.md](plans/architecture/native-package-runtime/decisions.md)、[authority-script.md](plans/architecture/native-package-runtime/authority-script.md)，以及 [context-generation.md](plans/architecture/native-package-runtime/context-generation.md) 的 Task 来源与消费部分。
5. 当前 [Record](records/architecture/native-package-runtime.md)。进入 S2 / S3 时再按 index 读取对应模块；研究证据仅在必要时读 [research.md](plans/architecture/native-package-runtime/research.md) 的对应领域。

## 读取与工作边界

从 `src/native/authority-transaction.js`、`task-authority.js`、`session-core.js` 和 `public/scripts/native/experience/logic/package.js` / `transactions.js` 等入口开始，仅按当前设计依赖追读。最新 main 若发生变化，只核对相关入口和调用链。

保持长期工作空间隔离，不将 main merge 进 docs / package。产品基线和 docs 文档分别处理；Plan 不依赖某台设备的绝对路径、工具或 Page 权限。

## 不要重复

- 不重新全面扫描 Atria、全部 docs / Plans / Records / Skills、reference 或整个历史。
- 不重新逐文件研究两个插件；锁定依据已在 research。
- 不引入旧插件 API、数据、角色卡和脚本兼容或迁移目标。
- 不把草图中的技术示例当成冻结 API；不建立平行 State / Authority / 调度 / 事实缓存。
- 不因普通阶段结束提前停下；按 index 的检查点停止汇报，不重复宣称没有执行的产品验证。

## 新设备接手提示词

> 在 ZZZdragondYNGPHX/Atria 继续 `ARCH-NATIVE-PACKAGE-RUNTIME`，从 S1 技术契约冻结连续推进至 S3，完成 CP1 核心运行闭环后停下汇报。先检查实际远端 main / docs 和本地状态，再按 docs:HANDOFF.md → plans/architecture/native-package-runtime/index.md → 当前阶段指定模块 → records/architecture/native-package-runtime.md 读取。main 起点为 4ac8affbf01bfb5fb576834bb7eedbeefd03c007，产品工作分支尚未创建；若远端已变化，只核对当前阶段相关代码。研究与大方向已完成，用户只把控范围、职责边界和关键取舍，技术细节自行推导。S1 仅设计，冻结并推送契约后进入 S2 实施，再进入 S3；复用既有 Native Authority 与 Runtime。每阶段执行对应验证，更新 Plan、同一 Record 与 HANDOFF，推送后继续，只到 CP1 停止；该用户授权优先于 Governance 的逐阶段停止规则。不要重新全面研究插件或加载所有模块。

## S1 接手补充

S1 契约已写入 authority-script / context-generation，产品 main 已本地 fast-forward 到基线。无关 AGENTS.md 和旧 docs 工作树 dirty 调整保留；任务 docs 从最新 origin/docs 独立工作树提交。不要重做 S1，进入 S2；仅运行最小相关本地验证，不主动运行远端 CI。
