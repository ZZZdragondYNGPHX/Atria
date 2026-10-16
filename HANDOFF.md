# Native Orchestration V3 — 前端接口交接

- Task ID：`refactor/atria-native-orchestration-v3`。
- Primary Workspace：产品 `main` 为最终集成目标；实际工作使用同名任务分支，不改 main。
- 当前源码：`refactor/atria-native-orchestration-v3@08e523b6f5f822fafc5f0fbb20b8c3e8ac8a46fc`；已合入 `main@c57fada6edeea255b29d857ba2585c1dbc9c098b`。
- 工作树：`tasks/atria-native-orchestration-v3/source`；文档为长期 `docs` 工作空间。
- 阶段：P5 页面尚未实施；前端可接入下述真实接口。完整 P1–P4/最终 Gate **NOT_READY**，后端未交付项仍属后端，不能交前端假实现。
- Plan：[唯一入口](plans/refactor/atria-native-orchestration-v3/index.md)。
- 当前必读：[接口快照](plans/refactor/atria-native-orchestration-v3/backend-integration.md)、[D8 交互](plans/refactor/atria-native-orchestration-v3/graph-editor-experience.md)、[实施顺序](plans/refactor/atria-native-orchestration-v3/implementation-plan.md)、[实际验收状态](plans/refactor/atria-native-orchestration-v3/acceptance-matrix.md)。
- Record：[同一永久记录，第六十四至六十八组](records/refactor/atria-native-orchestration-v3.md)。
- 视觉依赖：[Serene Canvas](plans/refactor/atria-serene-canvas/index.md)；产品现有 DOM/ESM/Tokens/Primitives/Patterns 为实现基础。

## 已完成

- 原 Project Task 三轮提案/Review→Result→真实 Graph output→原费用/OutputClaim/Root 收口；Task 仍待人工 Review，未自动 Commit。
- 原 Plan Draft/Validate/Publish/Binding；精确 revision、依赖 pin inspect、Host validation digest header。
- Run 按原来源 list、Host snapshot/delta、分页详情、脱敏 Timeline/diagnostics、原银行已知/未知费用、原 CAS 取消。
- 原普通 RP control source bind、零发送 preflight、boot/审核指纹 start、同 requestId 的原操作观察；真实正文仍读原 Chat。
- 有限原生 plan-strategy：额度只收紧、新修订发布、精确原 Binding CAS/rollback/discard；已有 Native Binding 不回退旧 target/evaluator。
- 同步最新 main、解决四处冲突；源码未反向合 main，没有编排新 UI。

## 未交付及交接边界

- plan-prompt、其它 strategy/来源、完整 Native Evaluation worker/自动晋升、其它 Actor/Task/Graph producer 组合仍待后端。
- 通用 Run start/resume/reconcile、Result body read、可信 Review Origin/再认证/approve、完整 restore/release/GC 仍待后端或对应阶段；当前 controls/reviewAvailable 的 false 必须保留。
- P6 旧五模式一次清退、最终集成/三端/真实收费与质量验收未完成。旧执行代码在构建分支尚在，不允许新增兼容别名、迁移、旧模式模板或 fallback。
- 这是一份前端实现所需的接口交接，**不表示全部后端已完成或准许发布产品**。Claude Code 负责前端，不接手补造上述后端 authority。

## 验证

- 合并后七 suites：124 PASS、4 SKIP（15.471s）；具体 suite 见 Record。
- Project terminal 与 Session 历史 proof 精选：10 PASS、32 filter SKIP（115.837s）。
- 原 resolver 双HTTP生产链：2 PASS、16 filter SKIP（16.884s）。直接修改与关键合并生产模块定向 ESLint/diff 通过；两个原测试文件的22个全文件lint问题与 origin/main 同数，未将它们称为全绿。
- 其它分轮、ACK/撤权/回滚/旧 Evolution 回归及失败修复见同一 Record；不累计冒充全仓一次通过。
- 本轮新增存储测试使用 FS/SQLite；没有 MySQL/Postgres、真实付费 Provider/外部 mutation、完整 Browser/三端验收的新证据。

## 交给 Claude Code 的提示词

```text
继续 Atria 的 Native Orchestration V3 前端实现。用户指定你负责前端；本次 Codex 已完成一批后端并停止在页面实现前。注意：完整后端 Gate 仍 NOT_READY，不要把这个交接理解为后端全部完成。

先定位 Atria 主仓库及同级 Atria-worktrees，检查真实 Git 和 AGENTS.md。源码任务工作树为 Atria-worktrees/tasks/atria-native-orchestration-v3/source，分支 refactor/atria-native-orchestration-v3，交接 HEAD 08e523b6f5f822fafc5f0fbb20b8c3e8ac8a46fc，含 main c57fada6e。文档在独立 docs 工作空间。沿当前任务分支工作，保护其它未提交内容，不覆盖其它活跃任务，不合 main、不发布、不删除任务分支。远端 refs 与工作区不符时以实际 Git 为准，先精确核对差异。

按顺序读：docs:README.md、HANDOFF.md、plans/refactor/atria-native-orchestration-v3/index.md、backend-integration.md 顶部“当前接口快照”、graph-editor-experience.md、implementation-plan.md、acceptance-matrix.md，以及 records/refactor/atria-native-orchestration-v3.md 最后第六十四至六十八组。视觉沿 plans/refactor/atria-serene-canvas/index.md 及其 Agents/Shell/组件模块，不恢复已完成旧视觉方案作为当前设计。

实现 P5 可接入的真实功能：
1. Plan Library；同一 PlanDraft 的桌面 Graph Canvas + Inspector，手机 Node/Edge List + Sheet，typed ports/edges、Draft 保存、Validate、Publish、精确 Source Binding。复用现有 DOM/ESM/Tokens/Primitives/Patterns，不迁移整站 React 或另造主题。
2. Run 默认 Timeline，可切 Graph；显示原来源、节点/Effect 状态、已知 token 与未知上界、本地工作、诊断、原 CAS Cancel。分页与 cursor/epoch/projection/visibility/version 不同就清旧状态重新 snapshot；断开界面或页面隐藏不自动 cancel。
3. RP/Session/Studio 按原产品入口接入，有显式付费预检和原状态观察。Project Root completed 只说明生成的 Review 出口完成，正式项目仍须原人工 Review/Commit。

只使用实际已挂载 API，精确字段见 backend-integration.md：
- /api/native/orchestration 的 Plan/Binding authoring、plans/revision、dependencies/inspect、runs/list/observe/details/diagnostics/cancel。read 与 mutation 的 envelope 不同；mutation 必有原 commandId、expectedHostBootId 和 X-Atria-Host-Boot-Id，取消还有原三个 CAS guards。
- validate 响应头 X-Atria-Validation-Digest 直接用于 publish；依赖 pins 的 integrity 从 Host inspect 取得。不要复制一套 Node hash/validator，不把 pin/发布成功当运行 grant。
- /api/native/generation/rp/source、rp/preflight、rp/start；启动复用 X-Atria-Preflight-Fingerprint，requestId 和原输入稳定，未知提交不换 ID 重发。RP 原 operation status 只供安全 refs/output 观察，正式正文重读 Chat，不从 result 下载原模型 wrapper。
- Run observe 的 delta changes 是带 hasMore 的有限 snapshot 窗口替换，不是任意字段 patch。需要完整 Graph/Timeline 时读 runs/details 的同版本分页。不要拿内部 eventSeq 当客户端 seq。

未实现功能必须反映真实不可用：通用 Run start/resume/reconcile、任意 GraphPatch/Effect dispatch、Result 原文、可信批准、plan-prompt、原生 evaluator/自动晋升等仍未开放。不能猜 API、编造 mock 成功、在 Browser 跑编排/收费/恢复、用 approved boolean 绕过授权，或把这些后端缺口改写成你要实现的 UI authority。显示安全诊断和禁用原因；需要新增后端合同的地方保留明确依赖，仍交后端后续处理。

遵守冻结的旧 Single/Spec/Loop/Agenda/Director 零兼容要求；不加 mode picker、同名模板、兼容 shim 或 fallback。P6 只在替代消费者闭包准备好后一次清退，不因本次 P5 误删其它 Native 业务共享服务。完善 Shell Search/deep-link/history/Back、键盘/IME、无障碍、移动 Sheet 与等价编辑；图渲染库先做局部 PoC 再定，不扩大技术栈。

由执行者做与改动相关的必要自查、测试和交互验证。用户禁止主动引入独立审查流程、审查专用子代理或多轮交叉审查，也不把独立审查设成交付前置。真实未测项如实记录，不把 mock、SKIP 或 localhost 合成 Provider 当真实外部/三端证据。持续更新同一 Record，必要时更新本 live HANDOFF；完成前端后按当前用户要求交付，不擅自集成 main。
```
