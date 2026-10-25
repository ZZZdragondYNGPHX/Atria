# 提示词与前端：实现分工

> 执行规则入口：[Governance §12.2](../../../README.md#122-minimal-validation-and-runtime-checks)。本文件不另设验证或复审门槛。

[入口](index.md)定义范围，[源码剖析](baseline.md)说明实际差距。实现按功能及直接依赖推进。

## 原后端中的改动

| 工作 | 修改落点 | 同步调用方 |
| --- | --- | --- |
| Node 独立 Program | V3 shared contracts、dependency reader、model-capability-authority、各域请求准备、ModelPort 与原 Host `programSelection` | Session、Project、RP、background、delegated、候选发布与 Inspector |
| 显式条目与继承 | 原 Program/Stage schema、`flattenPromptProgram`、`prompt-module-order`；移除 priority/expressionRank/ID 重排 | 同 target Module/Anchor 大纲、Stage 操作、derive、Preview、Fork、分享和 Package freeze |
| 动态 Context 接入 | 原 ContextPlan 到 Anchor/Contribution 的请求级投影 | Persona、History、Input、事实与材料消费；替换对应旧自动追加路径 |
| Provider 与 Token | 原 SemanticBlocks/Adapter/count/render/send | 有效位置、固定 Host 说明、最终请求与预览使用同一构造结果 |
| 两侧预览 | 原 Draft Preview 扩展两侧资源／选择及共享环境；base/candidate 各编译一次 | 不同修订、新资源及依赖、环境差异与三层 Diff |
| 独立作者 | 原 Host、Context source 合同、预算与结果投影增加样例用途 | Library 预览与手动试读；不借 Session/Project 身份 |
| 模板 | 原 Library 普通 Program/Module/Generation 资源 | 空白／通用骨架／任务模板、来源与可编辑副本 |
| 分享和升级 | 原 presets/resources/import/export 与 Revision | exact 多修订索引、逻辑 ID／修订映射、derive/Anchor 引用、私人三方差异、消费者采用 |
| 可选反馈 | 原 QualityProfile、Experience/Eval、Candidate 与 V3 Publication | 按需报告与局部建议；普通编辑与采用独立使用 |
| 独立图像 | 原 ImagePromptIR/Target/Rendering/Job/Asset 的非 Session 归属 | Library 视觉编辑、试生成与图片列表 |

## 前端中的改动

- 复用现有 Shell、Library/Studio 原编辑器和 V3 页面。先给已有用户能力接统一组件，再把新增作者操作接到原客户端。
- PromptEditor 增加共享编辑状态与 Undo/Redo，区分 JSON 和正文，保留原文缓冲。具体语义归[D8](preset-studio-experience.md)。
- Plan Library 的复制／派生、归档／恢复和未发布草稿删除使用原 PlanRepository/Authoring 的 `/plans/fork`、`archive`、`delete`；沿原命令 envelope 与版本比较，已发布修订通过归档保留。
- 全产品范围、页面顺序、当前 API 与视觉输入详见[前端实施输入](../../architecture/atria-frontend-audit/claude-code-frontend-prompt.md)。

## 集成依赖

以完成收尾的 V3 继续 Prompt 整合，保留同一次请求的 `orchestrationSend` 与 `programSelection`。当前已提交分支的内容冲突见[源码剖析](baseline.md)；合入时按最终源码解决，不按旧快照覆盖 Claude 后续改动。

排序 schema、继承、Compiler、编辑器和冻结／分享消费者在同一语义改动中更新。样例预览依赖新资源覆盖与 Context 接线；付费试读再接原 Compute/Provider。可独立完成的页面、模板与已有业务继续推进。动态世界后续由原 Context 接入。
