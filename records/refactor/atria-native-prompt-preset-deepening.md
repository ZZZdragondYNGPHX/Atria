# Atria Native Prompt Preset Deepening — 唯一 Record

- Task ID：`refactor/atria-native-prompt-preset-deepening`。
- Primary Workspace：`main`（未来实现，当前未授权修改）。
- Docs Plan：[index](../../plans/refactor/atria-native-prompt-preset-deepening/index.md)。
- 当前阶段：D1 冻结、D2 待选；同一份 Record 持续追加所有后续轮次。
- 起点：`main@5eb3bc7652cd9837ca8c555cf74976fab078932c`；`docs@6254dd1e73a44564824ca5b0a8c6d24ee0ace030`；V3 branch `c04f36925189d4064a63bdd6b9ca345ff2bcf805`。以上仅核对时刻，不替代后续实际检查。

## 2026-10-15 — D1 方向冻结与 D2 文档先行

**用户授权与决定**
- 选择方案 B，RP 文笔与 Agent 行为并重；继续融入 V3 单 Native Host，正式重构无 ST/旧 API 兼容。
- 加入强创作者“破限”需求：成年人虚构 RP 表达和高强度可编辑提示词；研究公开 2024–2026 Jailbreak/Prompt Injection 高级机制，不复制不稳定攻击 payload。
- 先创建并提交同一 Plan Bundle + Record，然后进入第二轮深入讨论；当前**没有授权**改动产品分支/main。

**真实工作**
- 远端静态阅读 `src/native/model-prompt-runtime`、`public/scripts/native`、`src/native/agent-intelligence`、旧 PromptManager/注入及 V3 企划/实现状态；不是全量依赖闭包。
- 查阅 ACL 2026 技术分类、Anthropic Many-shot、2026 Roleplay 机理研究、ICML OR-Bench 误拒、GEPA/ACE、SillyTavern Prompt Manager/STscript、Gemini 公开安全设置等来源。
- 在 `docs` 增加 Plan 的 index、decisions、baseline、research、creative-injection 与这份唯一 Record；不建立 HANDOFF、不创建产品工作分支。
- 设计候选 J1/J2/J3、作者编辑自由度 F1/F2/F3、Provider 拒绝归因 R1/R2/R3 均为 **OPEN**，不伪称已冻结。

**证据等级与限制**
- 实际：仓库文件与外部资料经远端静态读取；GitHub 文档树提交/可读取状态将在写入后核对。
- 未执行：本地 checkout/静态脚本、Node tests/build/CI、LLM/付费 API 调用、Provider 内容测试、PC/Windows/Termux 和 Browser/UI。
- 未来 E0 需重核 V3 HEAD、Prompt Render 角色/信任边界与实际领域消费者；研究来源中提到的攻击效果不得记为 Atria 产品性能。
- 下一步：D2 以 `creative-injection.md` 讨论作者可控的高级注入语义、成熟虚构文本表达、模型路由/误拒分类；获用户明确选择后下一轮按先更新提交文档再讨论的约定执行。
