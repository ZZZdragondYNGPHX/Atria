# 提示词／前端重构：已有能力与实现依赖

本文件沿用旧 E0 路径，供原有链接继续定位；职责是说明**哪些功能要接到哪里**。历史 SHA、审计与实际运行结果归[同一 Record](../../../records/refactor/atria-native-prompt-preset-deepening.md)，不再把它们编成开发前 Gate 队列。完整功能与顺序见[入口](index.md)和[后端分工](backend-implementation.md)。

## 1. 使用范围

D1–D8 及后续九轮功能设计已确定；详细字段在原模块内按真实调用关系落实。产品尚未全部交付，本次仅调整文档。旧“未授权”“先完成 E0 才能创建分支”等历史段落不新增许可或停止条件；实际执行按用户当前任务范围与仓库治理。

## 2. 编排与发送的接线

| 功能 | 已有基础 | 剩余实现 |
| --- | --- | --- |
| Node Program/Route | Prompt 分支已有可信内部 selection 与 fallback 编译；V3 已有多域实际消费者 | 整合真实 Node/Plan/Route 调用与 Program closure；不能把旧 Narrator 两／三节点快照当当前产品上限 |
| Typed 语义 | Prompt 分支已有 SemanticBlocks、来源降权、Provider 共同 lowering | 与 V3 Context/Result、最终请求和 Provider continuation 接通；沿真实能力处理不支持的 role/tools/schema |
| Source/受众 | 原 Host、Information/Memory、V3 SourceBinding/ContextPort | 每次请求取合法 Actor/Audience/Branch/Revision/Grant；动态世界以后提供的事实视图由此消费 |
| 显式顺序／Anchor | 原 Program/Stage/Module、parentRef/derive | 同 target 内单序列；Anchor 稳定身份；同 Anchor 多来源排序与去重；全链替换 priority 排序 |
| exact 继承 | 已有不可变资源、父引用及差异操作 | 明确 add 的插入位置、replace/disable/configure 的原位置、缺失锚点与父版本升级冲突 |
| 长会话 | 原 Context lanes/required/atomic groups、Spine/HCM | 必要因果与有效承诺优先；保持来源、认识状态和表达参考，不能截掉前提后让模型补造 |

## 3. 作者功能的接线

| 功能 | 已有基础 | 剩余实现 |
| --- | --- | --- |
| 编辑与预览 | 原 Library/Project exact 资源、literal/template、expression、有限 `/preview/draft` | 单 Draft 双编辑、编排树、来源、三层预览与 Diff；新身份与无 Session 样例上下文另接原 Host |
| 官方模板 | 当前普通 Program 以空 stage 起步 | 可编辑基础骨架与任务模板；创建普通原生资源，Studio 可直接选择 |
| 分享／升级 | 原 preset import/export、Library/Revision、资源依赖 | 编辑依赖闭包、本地 identity mapping、私人修改三方差异、手动更新消费者 exact pin |
| 独立图像作者 | 原 Target/Rendering/ImagePromptIR/Job/Asset | 非 Session 任务与资产归属、Gallery 和引用清理；不改走文本 Compiler |

## 4. 质量反馈是产品功能

原 QualityProfile、Experience/Eval、PromptCandidateStore 与 V3 Publication 负责可选评价和候选采用。`source_unready` 只阻止需要该来源的自动评价、晋升或认证；不阻止普通编辑、保存、导出、手动选版本和正常生成。没有结果时显示“未评价”，无需为交付编辑器先组织数据集、Judge 循环或质量验证项目。

## 5. 全产品前端

189 组盘点继续作为旧功能保留清单，另补新作者流程与 V3 Plan/Run 能力。前端消费原 Host/领域接口，不自行执行 Graph、铸造审批或计费。哪个具体操作尚缺后端，列清该操作与缺失接口；其余编辑、导航和已有业务继续完成。详见[统一交接](../../architecture/atria-frontend-audit/claude-code-frontend-prompt.md)。

## 6. 清退与资源生命周期

旧 ST/Workspace/Director/mode 由相应原生功能替换后同切，保留 Memory/Goals/Experience/Eval/Skills/Visual Director 等有效功能。资源引用、归档、删除、恢复和 Package freeze 沿原 ResourceGraph/Storage/Revision；不新增第二 Store 或永久兼容路径。

## 7. 真正的跨任务依赖

- Prompt/V3：Program selection、Context、Source、发送身份、Result/Receipt、候选发布由对应原服务共同接通；按实际源码解决接口重叠。
- 前端／Prompt：新顺序与独立作者 API 由原后端实现，编辑器展示同一语义；旧 API 缺功能不由 Browser 模拟。
- Prompt／动态世界：当前功能不等待暂停的 ARCH-DWE-01；以后消费其正式事实、Perspective 和有效时间结果。
- 视觉／Prompt：非 Session 图像任务由原视觉服务接入，其缺口不阻塞文本作者功能。

## 8. 2026-10-16 后端实施增量与真实剩余 Gate

本标题保留供旧锚点定位。历史 Prompt 分支 `760327891` 包含可信 Program selection、Typed lowering、部分 Source-currentness、有限 Draft Preview 与受限诊断；它不包含后续新增的全部编排、独立作者、模板和发行升级功能。实际实现及运行历史见 Record；本节不安排重新执行。

## 9. 2026-10-18 企划收口与 Codex 交接审查

本标题保留供旧锚点定位。最新企划采用上述功能依赖与[后端分工](backend-implementation.md)，不再以历史 E0、全分支审计或完整测试矩阵作为前置任务。实现字段、错误处理和接口整合由执行者在原权威内完成；不因例行工程选择重新开启多轮方案审查。
