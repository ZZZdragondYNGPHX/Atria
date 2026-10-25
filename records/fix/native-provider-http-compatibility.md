# Native provider HTTP compatibility — Record

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

- Task ID: native-provider-http-compatibility
- Primary Workspace: main
- Plan: 小型局部修复，无独立 Plan。
- Start HEAD: 302edb266c787a8717000e51bbc20f14106ea81a
- End/Tested HEAD: d0cb08b36dd6e925e50131dcf243d3c761c768e4

## Problem and findings

2026-10-04，用户更新实际游玩项目并补齐两条路由后，报告
`generation_execution_failed`，诊断截图只有 frontend/request HTTP 200。

实际调用专用测试 API。测试使用独立临时 FS authority、精确 3.0.0 Package
和非 Secret 配置；Secret 只在授权请求的内存 send boundary 中使用，未输出或提交。
未推进用户的真实 Session。

定位两项问题：OpenAI-compatible Messages 的 Connection 地址为 `/v1/completions`，
实际返回 HTTP 404；改为 `/v1/chat/completions` 后，API 返回 HTTP 400，拒绝工具参数
布尔枚举 `enum: [true]`（上游 enum 字段要求字符串）。404/400 原先都被统一掩盖为
`generation_execution_failed`。

## Implementation

- Connection 新增显式 `options.toolSchemaMode: string-enums`。仅用于有此限制的消息
  中转服务；默认 `json-schema` 维持原样。
- 只在 provider wire tools 副本上将非字符串 enum 转为允许值说明，保留类型、
  required 与其它约束。PromptIR/快照/canonical schema 完整保留；Host 仍拒绝不满足
  enum 的行动，非法输出不会发布 authority。Strict tools 拒绝此兼容模式。
- 现有 Runtime Connection 编辑器提供选择，切换原生 Gemini 会移除该选项；增加
  消息协议端点地址提示与中文文案。
- OpenAI/Raw text 与原生 Gemini/Anthropic 共用安全 HTTP 状态分类：404=endpoint，
  400/422=request rejected，401/403=authentication；不透出 response body/Secret，
  不自动 fallback。429/5xx 保持原有有界行为；无 fallback 的 route timeout 有明确代码。

## Slow gateway and final defaults

SillyTavern 的可用连接是 OpenAI-compatible、同一中转域名、
`Gemini 3.8 Flash`、流式。模型列表分别列出 `gemini-3-flash-preview` 与
`gemini-3.8-flash`，原配置与可用连接的模型不同。极简流式探针约 54 秒才收到
HTTP 200；后续真实 MCP 请求约 60 秒才返回。不能将此前超时解释为 API 不可用。

隔离完整 3.0.0 游戏回合：3.8 Flash、流式、4096 输出预算下，意图解析返回合法
`ask_work` 行动，接着正文返回并成功提交；共两次真实模型发送，未推进个人 Session。
512 预算的流式探针未得到合法行动。未拿到 finish reason，故不把截断机制当成已证实事实。

默认等待十分钟、输入 200K、输出 20K。已完成：

- 共享默认值：单次 600,000 ms、输入 200,000、输出 20,000，合计上下文 220,000。
  新 Runtime Models、Routes、Generation Profiles 与 Runtime Role 使用相应默认值；
  新生成参数开启流式。已有自定义 Profile 不自动覆盖。
- OpenAI-compatible Connection 可明确选 `responseMode: stream` 与
  `minimumOutputTokens`。提高实际发送预算时仍必须处于 Model 的预留输出额度内；
  快照 effectiveConfig 与预览均记录选项。默认新连接流式、最低输出 20,000；其它
  transport 不沿用这些选项。原游戏包和 pinned Session 无需修改。
- Host scheduler 接受内部 operation deadline；Turn 按冻结 routes 与有界请求次数
  计算总时限，避免单次 timeout 调大后仍被固定 120 秒的总上限提前取消。
  无新增重发、fallback 或后台轮询。
- 响应头之后的流式/body timeout 也报告 `generation_provider_timeout`，不再伪装为
  无效响应；手动取消仍保留原语义。
- scheduler 11 项通过
  （其它 41 项未运行）；Context/protocol 11 项通过（其它 35 项未运行）。新增选项默认/边界/保留 authored snapshot、慢 body 不重发、
  两段真实 Host Turn 超过 scheduler 默认后仍提交、新生成参数默认与清除逻辑通过。
- 实际游玩副本快进到新 main 并沿用既有可执行文件和环境重启。路由绑定、Secret ref、Package、Session 保留。配置 list 重读
  按 ID 比较（返回排序可能变化），MCP 状态 EXACT、Connection 读取生效。

## Final state

Core main 与实际游玩项目均为 `d0cb08b36dd6e925e50131dcf243d3c761c768e4`，代码已推送；
实际运行实例和 10 分钟 / 200K 输入 / 20K 输出 / 流式 / 3.8 Flash 配置重读确认。
原包版本和个人 Session 保留，现有无关 dirty 文件保护。记录完成后清理短期实现
分支/worktree。普通 bug/default-config 闭环无需新的阶段 Plan 或 live HANDOFF。
