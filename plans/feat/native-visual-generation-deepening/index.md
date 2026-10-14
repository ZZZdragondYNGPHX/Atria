# Atria 原生视觉生成系统深化 — Plan Index

- **Task ID**: `atria-native-visual-generation-deepening`
- **Primary Workspace**: `main`（Atria 产品源码）；`docs` 仅承载本 Plan
- **Status**: **Draft / 多轮设计中**（2026-10-14，第一轮方案 C 已冻结，第二轮待定）
- **Implementing Branch**: 尚未创建；待整个设计冻结后再创建 `feat/*` 工作分支交付 Codex
- **Verified code baseline (remote only)**: `main@7e1045ab836c22cafbc92c5de056ad701f56e723`
- **Reference**: [damoshen123/st-chatu8](https://github.com/damoshen123/st-chatu8)（读取其公开源码和行为作为研究材料，非 Atria 代码来源）
- **Predecessor**: [已完成的 NovelAI 官方插画 Plan](../novelai-illustration/index.md)。本 Plan 是后续独立深化，不回写其历史冻结范围。
- **Record**: 设计期无产品实施 Record；代码开发正式启动后创建 `records/feat/native-visual-generation-deepening.md` 并持续维护实际结果。

## 1. Goal

将 Atria 已有 Native 插画能力深化为可同时运行**手动创作、半自动辅助和全自动剧情插画**的统一视觉生成系统。扩展多生图后端与引用图/编辑能力，保持角色和画风连续性，使插画在 Session/Revision/Branch/SavePoint 中可追溯、可复现且不污染已提交的剧情正文。

本项目不是复活旧 SillyTavern 插件，也不是复制 st-chatu8；应围绕 Atria 的 Native 运行时、Route、Task Scheduler、AssetStore 与历史存档结构独立实现。

## 2. Frozen core principles (Round 1)

1. **方向：C — 分层混合架构**。共享一条底层管线和一套版本/资产权威；在上层分别支持手动、半自动、全自动的产品模式，而不是维护三份生成实现。
2. **不改写已提交剧情**。插图属于 Native Session 的呈现及媒体衍生数据；对应原文、版本和分支独立可追溯。模型不得靠生成插图反向改写剧情事实。
3. **以现有 Native 系统为基线重构**：优先演进 `atri_illustrations`、现有绘图提示词 Route、任务调度、密钥与 AssetStore，避免依赖已退役的 SillyTavern SD 扩展/DOM 写入路径。
4. **参考实现与版权边界**：可研究 st-chatu8 的交互/功能/协议行为；不得直接拷贝其 AFPL v9 代码或派生代码进入 Atria，除非另行完成授权、兼容性审查并取得明确决定。
5. **模型决定与用户控制分离**：不把“自动”解释为不可撤销地扣费或覆盖用户选择；手动生图、预览/编辑、取消和版本选择在方案设计中始终保留。实际默认值、自动执行时机与审批规则待后轮冻结。

这里仅冻结已明确批准的原则；下列候选接口、分期、支持渠道、自动生图策略未被批准。

## 3. Plan module map

| 文件 | 权威内容 | 依赖/使用 |
| --- | --- | --- |
| [baseline-and-reference.md](baseline-and-reference.md) | Atria 与 st-chatu8 的静态代码现状、差距、版权边界、证据置信度 | E0/基线定位、所有 Provider 或持久化任务 |
| [decisions.md](decisions.md) | 已冻结且跨模块生效的设计决策；与未决事项严格区分 | 每轮新增跨模块冻结决定时更新 |
| [architecture.md](architecture.md) | 候选端到端职责分层、Visual Director、模式/触发时机的第二轮备选方案 | 架构与编排讨论；确认后更新为正式契约 |

后续如确定 Provider、参考图、视觉身份、媒体编辑或缓存等独立大模块，应只新增对应模块，不在 `index.md` 重复详细规格。

## 4. Candidate layers (not yet a frozen interface)

`Native Narrative Snapshot / Project World State`
→ `Visual Intent & Director`
→ `Context / Character / Reference Resolution`
→ `Image Prompt IR & Backend Adapter`
→ `Native Job / Budget / Cancel`
→ `AssetStore / Image Versions / Branch Save`
→ `Display / Review / Edit`.

每层的具体权威归属、独立 Route 数量、何时可以预计算、哪些动作需要用户批准，依照后续轮次确定。

## 5. Tentative stages and reading routes

| 阶段（暂定） | 目标 | 必读 |
| --- | --- | --- |
| E0：冻结方案 + 接口设计 | 确认 scope、契约和验收，非产品开发 | `index.md` → `decisions.md` → `architecture.md`；涉及源码基线再读 `baseline-and-reference.md` |
| S1：中立协议/资产证据 | 拆除当前图片记录对 NovelAI 渲染的硬绑定，保留版本及存档权威 | `index.md` → 后续 Provider/持久化模块 |
| S2：多后端适配 | 逐一实现选定的 NovelAI、ComfyUI、云图像协议能力 | `index.md` → 后续 Provider 模块 |
| S3：角色/世界视觉连续性 | 角色身份、外观、服饰/状态、场景、参考图和出处 | `index.md` → 后续视觉身份模块 |
| S4：Visual Director 与触发 | 手动、半自动、全自动共用的意图/批准/预算流程 | `index.md` → `architecture.md` 和后续 Director 模块 |
| S5：编辑/画廊/交互 | 生成版本、衍生编辑、局部重绘及图像管理 | `index.md` → 后续编辑模块 |
| S6：集成与回归 | 存档/分支/资产/成本/任务隔离、跨平台可用性 | `index.md` → 当前被改动模块、对应 Record |

这些只是 **candidate stage routing**：阶段范围、先后和拆分都可随讨论变化，未经最终批准不能当成 Codex 的实施承诺。视频生成、视频素材、独立虚拟助手是否纳入需另行讨论。

## 6. Cross-module constraints

- **叙事权威**：以历史已提交的 Session/Revision/Branch、正式角色/世界状态为事实输入。视觉输出不得把角色“想象事实”写回剧情。缺来源时显式报告不确定，不能跨越其他分支找素材。
- **图片权威**：图片/修改版是带 provenance 的资产与版本，不直接修改文字 Variant；保留原图和派生来源，选中的展示版本可改变。
- **后端能力**：不能假定 NovelAI、SD、ComfyUI、OpenAI-compatible 各支持同样的 seed、负面词、参考图、mask、Vibe、LoRA。需要按每个实际 Provider 声明能力并拒绝不支持参数。
- **隐私与成本**：密钥留在秘密配置系统，快照不得带 secret；自动模式须设计预算、防重复与确认边界；不因为“取消”错误宣称供应商已退款。
- **第三方版权**：具体的 st-chatu8 文件、许可证和行为证据见 [基线](baseline-and-reference.md)；仅以其实现为设计参考，独立开发。
- **迭代兼容**：项目目前是 dev 阶段；迁移策略可按实际产品契约设计，不应默认增加无必要的历史接口兼容层。正式弃用/迁移规则后续冻结。

## 7. Validation / acceptance strategy (draft)

以真实代码和最小相关本地检查为准。后续至少需要：
- Provider fixture/协议测试：参数能力探测、请求快照、图片字节/宽高/类型校验、超时/取消/并发/幂等，真实 API 未执行不算通过。
- 保存/读取测试：每个 Session/Branch/Revision 的视觉资料与图片版本保持归属；SavePoint 恢复/导入/引用 GC 不出现跨分支错配。
- 视觉连续性测试：角色不会串人、失忆、偷看其他分支；可定位图像提示词来源，不保证模型最终图像一定完美。
- UI/E2E：模式切换、半自动批准、生成中状态、编辑和图片切换；目标平台按当前正式范围测试且不得伪称真机证据。
- 安全/预算：数据最小化，端点权限、外部 URL、图像尺寸及上传限制、任务成本和失败回收。

执行与验证规则以 [Governance §8 / §12 / §13.1](../../../README.md) 为准；Plan 不附加人为的调用许可或 CI 阶段停止条件。

## 8. Current design checkpoint

- Round 1: **C 分层混合架构 — 已确认**，见 [decisions.md](decisions.md)。
- Round 2: **视觉意图的生成时机及 Visual Director 决策权/审批边界 — 待讨论**，见 [architecture.md](architecture.md)。
- 尚未定案：后端范围与协议接口、自动触发阈值、角色视觉权威/记忆、参考图与 Vibe、批量与缓存策略、图片编辑与视频、验收细项。
- **禁止先行创建产品开发分支**；用户要求讨论完、设计冻结后由本对话创建正式 `feat/*` 分支供 Codex 开工。

## 9. Material routing/design changes

2026-10-14：新建此 Bundle；与旧 NovelAI 插画 Plan 独立，记录第一轮选定方向。后续轮次只记录实质设计变化和必要的模块路由更新，不以企划代替实施 Record。
