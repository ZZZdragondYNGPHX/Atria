# Native Orchestration V3 — 换设备继续 Codex 后端开发

> 2026-10-16：用户明确要求推送后换设备，由 Codex 继续后端。这是后端中断续接，**不是交给 Claude Code 的前端交接，也不表示后端完成**。恢复后核对真实 Git，继续已授权工作；此快照的暂停不作为恢复后的停止限制。

## Task

- Task ID：`refactor/atria-native-orchestration-v3`。
- Repository：`ZZZdragondYNGPHX/Atria`。
- Primary Workspace：产品任务工作树 `Atria-worktrees/tasks/atria-native-orchestration-v3/source`；源码分支 `refactor/atria-native-orchestration-v3`。
- Source HEAD：`a7cb649d0cd12cdaf7d7e91e96e654ba6261fea9`，已上传同名远端分支；含 `main@c57fada6edeea255b29d857ba2585c1dbc9c098b`，未反向合入 main。
- Documentation：独立 `docs` 分支，工作树 `Atria-worktrees/docs`。本快照前 docs HEAD 为 `61b851b4e967e8602afe2f6f8bad5652a86bca15`；本快照所在提交以实际 docs HEAD 为准，不能退回此前版本。
- 当前阶段：P1–P4 后端仍 IN_PROGRESS；最终 Gate NOT_READY。P5 页面未实施，P6–P8 未完成。
- Plan：[index](plans/refactor/atria-native-orchestration-v3/index.md)。
- 当前接口/剩余项：[backend-integration](plans/refactor/atria-native-orchestration-v3/backend-integration.md)。
- Record：[同一永久 Record](records/refactor/atria-native-orchestration-v3.md)，先看第六十九、七十组，再按需追历史。

## 用户当前分工与停止边界

1. Codex 先完成全部后端实现、接口和必要验证，沿同一任务分支持续推进；“已有 API 可供前端接入”不构成后端完成。
2. 到真实前端开发阶段时，推送最终后端提交并生成给 Claude Code 的前端交接提示词。
3. Claude Code 负责前端、前后端组装、最终集成和结束开发分支。当前 Codex 不提前实施页面、不合 main、不删除活跃分支/工作树。
4. 不主动引入独立审查流程、审查专用子代理或多轮交叉审查；由执行者完成与改动直接相关的自查、测试和验证。这里的评测质量与独立 case 证据属于产品 Eval，不是引入代理审查流程的许可。

## 已完成的当前后端基础

- 原 Native Plan/Draft/Validate/Publish、精确 Binding、Host Run/Graph/Effect/Result/费用引用与来源复验；有限 Session/RP/Project 生产链已有真实原权威接线。范围以接口和 Record 为准，不能泛化为任意 Graph 可运行。
- Project Review Result/OutputClaim/Root 闭包、Run 的安全 metadata Projection/Timeline/分页/诊断/取消、RP source/preflight/start 与安全 operation observation。主 origin 没有通用 Effect/Graph dispatcher 或 approve。
- `e82fde3a8`：有限 `plan-prompt` 的原 PromptCandidateStore exact style module/program 候选、新 immutable Plan、原 Route/Binding CAS 发布和精确回滚。实际共享 Engine 事务由原 Evolution intent/finalizing/receipt journal 包围；未知 ACK 读权威、不重发。作者 Draft、既有 Run、收费和历史 exact 资源保留。所选原 Route 的变更会使其它固定旧 pin 过期，不能静默转用新 Prompt。
- 已有九类 `limits` 收紧的 `plan-strategy`；Native binding 拒绝旧 workspace target/evaluator fallback。
- `a7cb649d0`：固定 worker 对 Native settings 使用 `evaluation/native-adapters.js`，通过原 Native Host/Controller/Ports 在私有 fixture Source 执行有限普通 RP、取消晚到挑战及 Project 工具/Review Root。真实 Provider 发送/Secret/收费仍仅由父 Host 的原 Evolution ledger 控制。原 source/job 在 RPC 与成功/失败结束复验。

## 真实剩余后端与下一行动

- 可信 Review Origin 后端与原账户再认证、独立 cookie/CSRF/nonce、完整审批绑定/消耗及真实领域授权仍待实现。按 [interface-contracts §15](plans/refactor/atria-native-orchestration-v3/interface-contracts.md#15-r05--可信审批的隔离交互合同) 与 [effect-authorization](plans/refactor/atria-native-orchestration-v3/effect-authorization.md) 推进；不把主 origin 的 Boolean 当批准。受控页面由后续前端阶段实施，后端合同须先闭合。
- Native Eval 只覆盖有限 profile。其余图/来源、M1 Project pilot、完整独立质量/价格与自动晋升仍未交付；两类 Native target 的 auto configure 目前继续明确 unavailable。不能移除 guard 后回跑旧 Director 来冒充实现。
- 其它 Actor/Task/background/Graph producer 组合、其余 strategy/Prompt 字段与来源、按原 authority 授权的 resume/reconcile/Result read、完整 restore/release/GC 等按当前 Plan 剩余清单继续。Unknown 不得重发、退款或删除保留根。
- P6 的后端替代与清退准备须保留原正式业务权威；完整原子 hard cut 依赖 P5 替代准备。不要为了删除旧代码误删共用 Native 服务，亦不要新增兼容、迁移、旧模式同名模板或 fallback。
- **恢复后的第一步**：核对源码/docs HEAD 与 dirty，读 index → backend-integration 顶部 → Record 第六十九/七十组及相关合同。从可信审批后端继续，并按依赖补齐其余后端；不要再次停在“接口可用”的局部节点。不重跑所有历史组，只做当前环境启动核查及变更直接所需验证。

## 验证与环境事实

- 第六十九组 Prompt suite FS/SQLite 12 项通过；相关 Prompt/strategy/authoring HTTP/Plan 仓库组合 47 项、原 Prompt candidates 20 项通过，精确分次归 Record。
- 第七十组新 Native evaluation 的 RP/Project 各 2 项均有 FS/SQLite 实证；最终 RP 定向 2PASS/2filterSKIP（21.169s），包括晚到取消与撤权停止后续发送；Project 2 项在组合内 PASS。没有宣称最终完整新 suite 再跑通过。
- 原 Skill/指纹 14PASS、原 Evolution 41PASS、HTTP 1PASS；本组 12 个 JS 文件定向 ESLint、diff 检查通过。过程失败、诊断、修复与跳过已在同一 Record 保留。
- 最新实现没有真实外部付费/SQL 全矩阵/三端验收证据；早期其它设备的 SQL 结果不能当本设备通过。所有本组发送为 localhost 合成。
- 换机后依实际 Node/依赖/Storage/Docker/SQL 状态准备环境；依赖、Secret、私有配置和生产数据没有随源码提交上传，不在文档中补贴凭据。真实 API 限额沿 Governance：每日 2000 次、20 RPM，由发送端计数排队。
- 此次只保存交接文档，没有改产品实现，不因换机快照重跑无变化的产品测试。远端仅作提交存储，不等待 Actions/PR。

## New-chat bootstrap prompt

```text
继续 ZZZdragondYNGPHX/Atria 的 Native Orchestration V3 后端开发。用户只是换设备，后端尚未完成，不是进入 Claude Code 前端阶段。

先检查仓库及各工作树的真实 Git/AGENTS.md，fetch 后使用源码分支 refactor/atria-native-orchestration-v3（交接 HEAD a7cb649d0cd12cdaf7d7e91e96e654ba6261fea9）和独立 docs 分支；保护本机未提交内容，不盲目 reset。产品工作树通常在 Atria-worktrees/tasks/atria-native-orchestration-v3/source，文档在 Atria-worktrees/docs；按本机实际布局定位，缺工作树再安全建立。

先读 docs:README.md 与最新 docs:HANDOFF.md，再沿 plans/refactor/atria-native-orchestration-v3/index.md 读取 backend-integration 当前快照、interface-contracts §11/§15/§17.78–17.79、相关 effect-authorization/implementation-plan/acceptance-matrix，以及 records/refactor/atria-native-orchestration-v3.md 第六十九、七十组。真实 Git 优先于历史描述。

Codex 先完成全部后端及必要验证；从可信 Review Origin/原用户再认证等后端剩余项继续，按依赖补齐原生 Eval/自动晋升及其它真实未交付项。已有有限 Plan Prompt、RP/Project 原生隔离评测和 HTTP 接口不代表后端整体完成；不可用 guard 要在真实权威实现后才能开放。复用原 Source/Model/预算/收费/Prompt/Project/Approval/Evolution 权威，保留 CAS、异步撤权复验和 unknown 不重发语义。不要主动加入独立审查或审查子代理。

只在后端实际完成、到前端开发阶段时停下，推送并发给用户 Claude Code 的前端交接提示词。Claude 负责前端、前后端组装、最终集成与结束开发分支。当前不要开发页面、合 main 或清理活跃任务分支；不等待额外“继续”许可，不因一批提交/测试通过提前交接。续接后按治理处理已读的 live HANDOFF，并持续更新同一 Record。
```
