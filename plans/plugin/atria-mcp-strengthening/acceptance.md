# 分层全域验收

实施依据与阶段依赖见 [implementation](implementation.md)，威胁编号见 [security](security.md)。所有结果写入本任务唯一 [Record](../../../records/plugin/atria-mcp-strengthening.md)。本页为预期行为；没有执行证据的条目均待验。

| 能力域 / 阶段 | 最小行为闭环 | 关联威胁 | 证据要求 |
| --- | --- | --- | --- |
| Control / E1 | 挂起审批/长任务时 status/cancel/diagnose 可达；READ 有界；同目标串行、不同目标并行 | S03–S06 | 调度单元 + 并发 stdio + Native 双客户端 |
| Journal / E1 | dispatch 前原子记录，异常重启后 unknown、不重放，Lease 不恢复 | S06/S13 | 断线/进程重启/损坏/隐私故障测试 |
| Protocol / E2 | 2025 Form、2026 MRTR 真实 wire；篡改/重放/降级拒绝；Tasks 可选 | S02 | SDK wire；真实客户端与人工分别记录 |
| Binary / E3 | 大于 1 MiB 正式包传输/预检/独立 Review/Install，分块/Hash/权限 | S09 | 单元 + 隔离真实产品大包 + 故障 |
| Studio / E4 | 直接 Workspace 与 Project Task 两条路径，Review/Commit 独立，CAS/recovery | S03/S05/S06 | 原生单元/合同 + 产品 Preview/ChangeSet |
| Session / E4 | Save/Restore 新 Branch、旧历史保留、错误 fork/retry 退役、commit receipt | S03/S06/S07 | 原生存储比较、MCP 真实流程 |
| Generation / E4–5 | input/admission/send/usage/finalize 分层；长会话与停止不盲重发 | S06/S14 | 本地注入 Provider + Native ledger/receipt |
| Runtime / E5 | Secret→Endpoint 审查、版本化资源、纯 Preview、显式成本/Fallback | S07/S08 | spy 无 Secret/Send/写入；Native CAS/网络 fixture |
| Cognition / E5 | Memory 源 guarded/headless、Goal/Evidence/Experience/Evolution 分域能力与失效 | S07/S11 | 分域原生合同、source/CAS/自动 wake 边界 |
| Resource / E6 | Library closure/Bundle 同意图恢复、Package exact hash/grants/version | S05/S06/S09 | 原生 Bundle/Package 真闭环与故障 |
| Media / E6 | Image durable Job、Mask CAS/Freeze、Gallery/Reference/GC、Speech 分层恢复 | S07/S09/S14 | mock adapters + 原生状态/资产 hash |
| Code trust / E6 | Skill versions/candidate/apply、URL 安全、Extension 默认禁用/启用独批、Host 权限 | S01/S08/S10 | 不执行第三方代码的恶意输入测试 |
| UI / E7 | 固定 Surface semantic interaction、ScreenshotProof、Epoch/Preview 失效 | S01/S12 | Browser fixture + 真实隔离产品 UI |
| 全链路 / E7 | Studio→Apply→Build→Binary→Preflight→Review→Install→Native Receipt | S02–S14 | 自动化联调 + 每层身份/费用/审批区分 |

## 客户端与平台策略

- SDK v2 是依赖迁移，协议版本是协商结果。记录每次实际 negotiated protocol 与 capabilities；不凭客户端品牌推断。2026 MRTR 请求态强绑定；2025 客户端用 legacy form；两者均无可信通道时只开放合法纯 READ。
- 2025 legacy form 兼容路径覆盖 `2025-06-18` 与 `2025-11-25`。本机 Codex 0.162.1 的实际 app-server 握手为前者；wire 合同与真实工具连接、真人审批仍分别取证，不用 SDK 默认版本替代真实协商值。
- Tasks 扩展未经协商不公布 tasks 支持，使用固定 registry 的 operation status/cancel/reconcile。不为支持 Tasks 另建业务 runtime。
- 真实 Codex 与 Claude Code 分别记录版本、连接/工具/图片/取消、审批允许/拒绝/超时。app-server 自动化可证明连接与工具展示，不能证明真人审查体验。
- Windows 当前可执行的 Node/Browser/FS 验证可记录为实证；CachyOS、Termux 必须有对应环境才能声明通过。仅环境检查/兼容实现仍标待验。
- 无付费 Provider 权限时使用原生注入 adapter 验证成本/unknown 契约，真实 Provider 端到端维持待验；不虚构钱数/退款/成功。

验收报告分别使用“静态核查”“单元/合同通过”“真实产品通过”“浏览器通过”“真实客户端自动连接通过”“人工待验”“平台待验”。不得相互替代；不以尚缺人工证据停止可独立实现和验证的工作。
