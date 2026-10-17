# Native Orchestration V3 — 用户要求换设备续接

## Task 与真实状态

- Task ID：`refactor/atria-native-orchestration-v3`，仓库 `ZZZdragondYNGPHX/Atria`。
- 用户于 2026-10-17 明确要求及时停止、换设备继续，并单独授权本次提前推送未完成源码及 docs。此次推送只是换机存储，不代表后端完成、前端交付或集成许可。
- Source branch：`refactor/atria-native-orchestration-v3`；HEAD **`1b243b8a4acd3ea9b5794a66752ca7f157965272`**。该提交明确为 WIP，上一完整保存点 `50d4061b5`。
- 文档使用独立 `docs` 分支；本快照与同一 Record 一并提交。docs 原本与远端分叉，已在独立干净工作树 merge `origin/docs@d0bbcd7ab`，保留其它任务提交，没有 force push，没有合入 main。
- **后端尚未完成。不要进入前端、不要合入 main、不要结束开发分支。** 先完成全部后端并验证，随后才给 Claude Code 前端、组装和最终集成交接提示词。
- 用户恢复后的要求：持续完成后端，普通工程问题自行解决；只有破坏性操作才请求同意。阶段、失败实验和单次回归结束都不是暂停点。不另启独立 review 工作流/审查 agent 或把它们当 Gate。

## 恢复阅读顺序

1. 先 `git status`、核对实际分支/HEAD、fetch；保护设备已有未提交内容，以真实 Git 为事实。
2. `docs:README.md` 与本 `HANDOFF.md`。
3. Plan 唯一入口：`plans/refactor/atria-native-orchestration-v3/index.md`。
4. 同一 Record：`records/refactor/atria-native-orchestration-v3.md`，先读第一百零四组与第一百至一百零三组，需要时追溯。
5. 仅按当前工作需要读 Plan 的 `graph-control.md`、`context-sharing.md`、`backend-integration.md`、`implementation-plan.md`、`interface-contracts.md`（§17.104–17.107）和 `acceptance-matrix.md`。不要默认扫描全部文档/历史。

消费本快照后，继续写同一 Record；本 HANDOFF 不再需要时按 Governance §7 删除。不因下一次测试失败或阶段完成另写 HANDOFF。

## 已保存实现

第一百零三组之前的完整事实归 Record。近期包括真实 RP Planner→原 GraphController→Narrator，以及同 Source Draft→Narrator Graph Result，原 Source/私有 Scheduler/Context/ModelPort/银行/Result/Chat 权威已接通；它们都是有限静态 profile，不能当作通用动态图已交付。

当前 **第一百零四组 WIP** 已提交的实现：

- `rp-review-profile.js`：静态四节点 `Draft → Review`、`Draft + Review → Narrator → Output`。Draft 明确同时授权 Review 与 Narrator 这两个直接后继；Review 不洗白摘要或扩大 Audience。
- Review 实际走原 Route/Context/ModelPort；控制 JSON 仅 `{decision, reasonCode}`。`approve` 只配 `quality_ready`；`rerun` 只配固定枚举反馈码，不回传自由文本或旧草稿。质量 approve 不构成高风险 Effect 的授权。
- 原 `ReviewController` + `rp-review-contracts.js` 绑定实际 Model、原 Draft Result/Traversal、D3 receipt、费用与 settlement。控制 parse/adopt 使用原银行；shared 只读费用证明抽到 `rp-control-work-contracts.js`，不自建账本。
- 有界 rerun：原 Controller 使旧 Attempt/Result 失效，创建新 pending Attempt/新 grant；新 Draft 只接受固定反馈码及来源引用，不把旧正文作为输入。剩余 review/attempt/edge/request 预算不足、无进展、重复 rerun 均停止，不重置计数或旧费用。
- `output-transition-contracts.js` 支持显式多 producer 历史证明；最终 Narrator 必须核对当前 Draft 和 approved Review。历史输出闭包包含所有 Draft/Review/Narrator/Chat Effect，unknown usage 不能伪装 completed claim。
- **最近才改的计数时机**：Review 名额在原 `AttemptController.activate` 的同事务 `review_admission` receipt 中消耗；`decide` 不再重复计数。无效 JSON/失败 Review 也消耗实际已准入的 Review 名额，避免花费后绕轮数限制。旧接口 §17.104 的详细计数描述尚需在继续验证后同步，不能盲按旧描述改回实现。
- `RunObservation` 增 `rp_graph_review_completed`；evaluator 指纹加入三个新合同文件（预计新 suite 47 项，尚未跑，不计通过）。

## 实际验证与未确认结果

都是 localhost 合成响应、真实原 FS/SQLite Engine/HTTP 链路；本组没有新增真实 Provider 调用，也没有独立质量/价格/自动晋升结论。

- Review 初次 approve/rerun 四参数：4 PASS（34.625s）。
- 无效 JSON、额外批准字段、任意反馈码、矛盾标签、轮数、request headroom、无进展、重复 rerun：16 PASS（71s）。
- 冷 Engine 历史读取、合法 Source 编辑删除、重 hash 篡改拒绝、真实 Review 等待期间 Binding 撤权/Root 取消、unknown usage：精选 8 PASS（40.159s，包含两个已有正向）。新 suite 的原 26 项分批已通过。
- **上述 Model Review 场景在最新 admission 计数修改之前跑过，最新提交仍需要相关回归。** 原纯 `review-controller.test.js` 已按新计数语义完整 36 PASS（13.636s）。
- 最后新增 admission/decision/settlement × saved/no_save × FS/SQLite，共 **12 项 ACK**；当前 `rp-review-producer.test.js` 总计 38 项。最后 ACK Jest 进程已结束，但返回输出在上下文切换时丢失，**结果未确认，不得计为 PASS**。没有继续启动测试，遵守用户及时停止。
- 当前提交的 17 个明确实现/测试文件 ESLint 检查通过；`git diff --check`、提交前 staged diff check 通过。
- 共享 Attempt/Transition 改动后的 Planner、Graph Result chain、parent continuation、Project、background、Run HTTP、evaluator 等相关回归尚未执行。不要声称完整后端验证通过。

## 恢复后先做

1. 核对当前文件与 HEAD，先运行 `rp-review-producer.test.js` 的 ACK 12 项，按实际失败定位修复。当前 ACK 设计是保守阻塞、不自动重发，不应为让测试通过伪造成功；saved 元数据恢复优化是另外仍需实现/验证的工作。
2. 对最新 admission 计数改动补完整 Review producer 回归，再运行受共享 Attempt/OutputTransition 影响的消费者和 evaluator。针对变化测试，不无理由重复已通过而未变化的检查。
3. 必要修复后同步接口 §17.104 的计数规则与新实际 Review profile，并续记同一 Record；第一百零四组目前只有 WIP，不能据此核销整个 D3/D4。
4. 接着实现其余后端：真实 Judge、通用图/动态图及其它 Source/Actor/Task 组合、可信高风险消费者、完整授权 resume/restore/GC/release、完整工程验证和真实 Provider 工程验证等。准确范围按 Plan/Record 逐项核对；这里列举不是新设计或缩小范围。

## 必须保留的边界

- 原 Host/Source、GraphController、RouteResolver、RunControl bank、领域 writer 才是 authority。Model 文本、JSON、Review 标签、metadata、历史 receipt 读取都不能铸造新 grant/审批。
- 当前 Graph Result reader 仍限静态原 RP 同 Source 直接后继，不要简单去掉 guard。将来动态图必须由原 Plan blueprint + 已接受 Patch 推导 publication 时冻结的直接后继集合；后加边绝不能追溯扩大旧 Result Audience。复用原权威，不造第二 Graph 系统。
- 私有 Scheduler capture 不因冷启动 metadata 恢复而复活；完整 resume 要重新验证真实 Source/recipient/费用/权限。不要直接放宽 epoch、rollback 费用或覆盖共享 bank。
- 同事务撤权/取消已发生的合法写入必须保留；拒绝后续采纳时不能把撤权自身一起 rollback。
- 不添加前端页面、Browser 权威、compat shim，不合 main；没有独立评测资料时不虚构 sealed/human preference/price/auto-promotion 通过结论。

## 设备与测试环境

以下只是本设备快照，不保证新设备路径相同，不提交私有配置：

- Source 原工作树 `D:\Dev\Atria-worktrees\tasks\atria-native-orchestration-v3\source`；长期 docs `D:\Dev\Atria-worktrees\docs`。本次 docs merge/交接在独立 `device-handoff-docs` 工作树完成。
- Node v24.18.0 / PowerShell。Source `node_modules` 是本机 junction；Jest 在 `tests/node_modules`，新设备核对/安装依赖，不能把 junction 或缓存当代码推送。
- Jest 在 source 的 `tests` 目录执行：`node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.config.json --runInBand --runTestsByPath native-orchestration/rp-review-producer.test.js --testNamePattern ACK --silent`。完整 suite 去掉 pattern；Review suite 自带 60s timeout。长测试要保留 session ID 并实际收集最终输出。
- 原本机用户 dirty 必须保留：Source `D CLAUDE.md`；docs `D CLAUDE.md`、修改 `plans/architecture/atria-frontend-audit/design-proposal/atria-visual-direction.html`；未跟踪该 audit 的 `.playwright-mcp/`、`design-proposal/_build/`、`plans/feat/agent-experience-evolution/`。此次未提交这些内容；不要在新设备误称已同步。
- 私有 Provider 配置/限流记录路径由用户给定为 `D:\Dev\Atria-private`，只在本机，不在 Git。用户确认**目前没有独立质量评测 sealed 案例或人工偏好/评分资料**。新设备可先做不依赖私有配置的实现；需要真实调用时再核对本机配置路径，不输出密钥/请求正文。
- 真实调用限制：每日 2000 次、20 RPM，按原私有限流账本/rolling 24h，发送前计数，未知状态不重置。原 CLI 在 source/tests：`node native-orchestration/native-live.mjs project <private-config-path> <private-quota-ledger-path>`。不要复制旧设备的绝对路径后盲发；此前真实 Project 实验尚未通过，具体见 Record 第九十一至九十二组。
- 自动审批拒绝删除的目录按用户要求放 Windows 回收站，不绕过拒绝永久删除。本次没有删除目录或操作未明确属于本任务的进程。

## 新对话接手提示词

```text
继续 ZZZdragondYNGPHX/Atria 的 Native Orchestration V3 后端开发。这次只是换设备，后端未完成；不要提前前端、合 main 或结束分支。
先 git status 和 fetch，核对真实 Git 与 AGENTS.md，保护本机未提交内容。源码分支 refactor/atria-native-orchestration-v3，换机 HEAD 1b243b8a4acd3ea9b5794a66752ca7f157965272（WIP）；独立 docs 分支包含本次 HANDOFF.md。先读 docs README.md、HANDOFF.md，再按入口读取 Plan index 和同一 Record。
当前第一百零四组已保存真实 RP Review 与有界重做，但最后 12 项 ACK 测试结果未确认，最新 admission 计数修改后的相关回归尚未完成。先核对并修复验证，再继续全部剩余后端；不得把 WIP 当作后端完成。
持续做到后端全部完成验证，只有破坏性操作才请求同意，其余自行解决。用户仅为此次换机特许提前推送；以后仍先完成后端，再推送并给 Claude Code 前端、组装和最终集成交接提示词。没有独立质量评测资料，不伪造质量/价格/晋升结论。换机 HANDOFF 消费后按治理处理，不在失败或阶段边界另写交接。
```
