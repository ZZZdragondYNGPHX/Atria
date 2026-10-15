# 源码 E0 预审：可复用能力与潜在接口风险

**静态检查**：`main@5eb3bc7652cd9837ca8c555cf74976fab078932c`、V3 实现分支 `refactor/atria-native-orchestration-v3@c04f36925189d4064a63bdd6b9ca345ff2bcf805`。本审查只覆盖相关链路与文档，**没有逐行读取所有仓库文件，不是全量源码/运行审计**。

| 路径 | 当前可见事实 | 本企划如何复用 |
| --- | --- | --- |
| `src/native/model-prompt-runtime/presets.js` | `PromptPresetStore` 组织 immutable Program/Module/Generation exact refs 和 Preset-owned Regex | 保留原生 Library 资源权威 |
| `src/native/model-prompt-runtime/prompt-compiler.js` | derive/stages/conditions/typed params；`system.foundation/character/world/style/response`、`agent.task/evidence/constraints`、前后 history/input 和 response prefills；编译记录 | 基于原编译器扩展语义而非 Browser 新实现 |
| `src/native/model-prompt-runtime/generation-service.js` | Route/Context/PromptIR/Provider/Token 预算/补发与调用证据 | 不复制 Provider 或计费路由 |
| `src/native/model-prompt-runtime/compiled-binding.js` | Source、Resources、Tools、Output、Stable Prefix 指纹 | 沿用诊断证据，指纹不授予权限 |
| `public/scripts/native/context-compiler.js` + `src/native/model-prompt-runtime/context-providers.js` | 受选 World/Memory/History/Persona evidence lanes 和 request budget | 不建立新 Context owner |
| `public/scripts/native/prompt-presets.js` + `prompt-authoring.js` | Preset 编辑、模块分类、原生资源 fork/derive、导入/导出 | 改造创作控制体验 |
| `src/native/model-prompt-runtime/prompt-candidates.js` + `src/native/agent-intelligence/evolution-targets.js` | Prompt candidate 检查/发布/回滚，RP 旧 workspace 与 Project style 两类 consumer | 待 V3 `plan-prompt` 消费者硬切后新增文学维度，不复刻 Eval |
| `src/native/agent-intelligence/evaluation/quality.js` | player_agency、knowledge_boundary、actor_voice、narrative_response 等 RP 维度 | 补充文学/过度拒绝的正式证据，不取代现有 Judge |
| V3 `docs:plans/refactor/atria-native-orchestration-v3/interface-contracts.md` §11 | 已冻结新 PlanBinding 和 Node exact PromptModuleRef、plan-prompt Evolution target | 本 Plan 不重复物理注册/Runtime 主权 |

## SillyTavern 旧注入的局限

`public/scripts/prompt-injections.js` 使用 `RELATIVE`、`ABSOLUTE`、`ATTACH_EXISTING`；还可在消息中拼接附件内容，依赖 role、消息索引、注入位置。其本质是**位置/消息拼接**，缺少对“作者规则、角色知识、检索证据、任务指令、第三方文本”的可靠权限和来源区分。正式重构无需兼容老位置和格式。

## 待验证的关键缺口

1. `src/native/model-prompt-runtime/prompt-renderers.js` 把 contextSlots 默认渲染为 system；当前 `prompt-compiler.js` 的部分 `context.fact` 会进入该路径。**存在需追踪的信任边界，非已证实漏洞**。要区分来源事实与受信 author instructions。
2. 当前编译器的 Stage/Target/Conditions 保障结构性校验，但缺少可见的同目标文本语义冲突、上下文提权诊断与 Provider-specific 稳定性证据。
3. `EvolutionTargets` RP 仍有旧 Workspace/Director 绑定；V3 设计明确要求清退。若本 Plan 现在修改旧路径会与 V3 重构冲突。
4. 不同生成 Provider 的 system/developer/prefill、内容筛选配置和 fallback 差异须由实际 capability 与 wire fixture 验证，不可写“所有模型均支持破限”。
5. 过度拒答、合法创作质量下降与 Provider 的真实拒绝必须能分离、留证，并和普通安全评测的风险任务分开。
6. 评测与验证保持原 Governance 的每日 2000 次 API、20 RPM 硬限制；具体阶段由后续 E0 按真实触达面确定。

## E0 源码范围（未来，未执行）

`src/native/model-prompt-runtime/**`、`src/native/adapters/*generation*`、`public/scripts/native/prompt-*`、`context-compiler.js`、`src/native/agent-intelligence/**`、V3 `src/native/orchestration/**`、ST 注入及真实消费者、Library/Project/Package/Play/Studio、相关 `tests/native/**` 与 `tests/agent-intelligence/**`。需按当时最新 V3 HEAD 跑静态闭包和最小相关实际测试。
