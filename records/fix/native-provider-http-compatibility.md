# Native provider HTTP compatibility — Record

- Task ID: native-provider-http-compatibility
- Primary Workspace: main
- Status: Complete — local implementation/integration; full real-provider turn remains unverified.
- Plan: 小型局部修复，无独立 Plan。
- Start HEAD: 302edb266c787a8717000e51bbc20f14106ea81a
- End/Tested HEAD: 2f9251b33d7b6a5bf146b3d96b9e5af5d2301949

## Problem and findings

2026-10-04，用户更新实际游玩项目并补齐两条路由后，报告
`generation_execution_failed`，诊断截图只有 frontend/request HTTP 200。
核对实例 source revision 与两条路由均正确，当前失败已不是前次缺失路由。

用户明确授权发送专用测试 API。测试使用独立临时 FS authority、精确 3.0.0 Package
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

## Minimal local verification

- Native provider matrix + Host：69/69；Generation Core：34/34；Runtime UI：17/17。
  共 120 项相关测试通过。覆盖错误代码穿过真实 HTTP Host、不会把错误响应中的密钥
  带入诊断、fallback 分类不变、compat 默认不改变工具、canonical bool false 被拒绝且
  Session revision 不变、编辑器保存/切换与新的 remediation。
- 变更 JS ESLint、git diff --check 通过；main 上变更文件 ESLint 通过。
- 实际游玩项目快进到相同 main HEAD。通过 If-Match 与 serverBoot guard 更正连接地址，
  启用 string-enums。只改该 Connection 的 endpoint/options，原配置有本机私密临时备份；
  model/routes/Secret ref 保留，未改用户的游戏 Session。沿用既有 Node 可执行文件与
  启动环境，重启为新的运行实例，身份端点确认新 HEAD。
- 真实 stdio Atria MCP 对实际实例执行 `atri_status` / `atri_read connection.list`：source
  EXACT，正确端点与 string-enums 生效。这轮 MCP 检查本身 0 次模型调用。
- [结构化验证证据](native-provider-http-compatibility-evidence/validation.json)。
- Core AGENTS.md 与 docs 四个已有 dirty 文件保护，未运行远端 CI/设备测试。

## Real API limits / next verification

共 8 次用户授权的 API 请求：原地址 404；正确消息地址的 canonical tools 请求 400；
兼容 Schema 的消息请求与原生 Gemini 请求分别在 60 秒无响应；一次 120 秒原生请求
被已有 Task scheduler 时限终止。两次极简文本 minimal-thinking 探针被上游明确拒绝
`THINKING_LEVEL_MINIMAL`，最后一次 low-thinking 极简文本在 30 秒超时。这些
thinking 设置仅属于诊断探针，没有持久化到用户配置。

不能据此声称完整真实模型游戏回合已通过，也不能断言所有客户端都不可用。已询问
用户同一模型在其它客户端是否能够响应；待得到可用服务/模型证据后，再做最小完整
回合验证。历史 .atria 没有改动；不新增个人数据、Secret、日志或本地路径到仓库。

## Final state

实现推送并集成 main；实际游玩副本和运行实例更新；已知本地配置与 Schema 问题已
修正。完整真实 API acceptance 保留上述限制，未伪报通过。短期实现分支/worktree
完成记录后删除；无需代码任务的 live HANDOFF。
