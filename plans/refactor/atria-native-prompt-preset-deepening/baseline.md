# 源码 E0 预审：可复用能力与潜在接口风险

本审查只覆盖相关链路与文档，**没有逐行读取所有仓库文件，不是全量源码/运行审计**。

| 路径 | 当前可见事实 | 本企划如何复用 |
| --- | --- | --- |
| `src/native/model-prompt-runtime/presets.js` | `PromptPresetStore` 组织 immutable Program/Module/Generation exact refs 和 Preset-owned Regex | 保留原生 Library 资源权威 |
| `src/native/model-prompt-runtime/prompt-compiler.js` | derive/stages/conditions/typed params；`system.foundation/character/world/style/response`、`agent.task/evidence/constraints`、前后 history/input 和 response prefills；编译记录 | 基于原编译器扩展语义而非 Browser 新实现 |
| `src/native/model-prompt-runtime/generation-service.js` | Route/Context/PromptIR/Provider/Token 预算/补发与调用证据 | 不复制 Provider 或计费路由 |
| `src/native/model-prompt-runtime/compiled-binding.js` | Source、Resources、Tools、Output、Stable Prefix 指纹 | 沿用诊断证据，指纹不授予权限 |
| `public/scripts/native/context-compiler.js` + `src/native/model-prompt-runtime/context-providers.js` | 受选 World/Memory/History/Persona evidence lanes 和 request budget | 不建立新 Context owner |
| `public/scripts/native/prompt-presets.js` + `prompt-authoring.js` | Preset 编辑、模块分类、原生资源 fork/derive、导入/导出 | 改造创作控制体验 |
| `src/native/model-prompt-runtime/prompt-candidates.js` + `src/native/agent-intelligence/evolution-targets.js` || 待 V3 `plan-prompt` 消费者硬切后新增文学维度，不复刻 Eval |
| `src/native/agent-intelligence/evaluation/quality.js` | player_agency、knowledge_boundary、actor_voice、narrative_response 等 RP 维度 | 补充文学/过度拒绝的正式证据，不取代现有 Judge |
| V3 `docs:plans/refactor/atria-native-orchestration-v3/interface-contracts.md` §11 | 已冻结新 PlanBinding 和 Node exact PromptModuleRef、plan-prompt Evolution target | 本 Plan 不重复物理注册/Runtime 主权 |

## SillyTavern 旧注入的局限

`public/scripts/prompt-injections.js` 使用 `RELATIVE`、`ABSOLUTE`、`ATTACH_EXISTING`；还可在消息中拼接附件内容，依赖 role、消息索引、注入位置。其本质是**位置/消息拼接**，缺少对“作者规则、角色知识、检索证据、任务指令、第三方文本”的可靠权限和来源区分。正式重构无需兼容老位置和格式。

## E0 源码范围（未来，未执行）

`src/native/model-prompt-runtime/**`、`src/native/adapters/*generation*`、`public/scripts/native/prompt-*`、`context-compiler.js`、`src/native/agent-intelligence/**`、V3 `src/native/orchestration/**`、ST 注入及真实消费者、Library/Project/Package/Play/Studio、相关 `tests/native/**` 与 `tests/agent-intelligence/**`。需按当时最新 V3 HEAD 跑静态闭包和最小相关实际测试。
