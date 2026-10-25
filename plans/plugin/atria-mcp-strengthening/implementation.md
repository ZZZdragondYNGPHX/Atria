# 实施依赖与 E0 契约收口

> 执行规则入口：[Governance §12.2](../../../README.md#122-minimal-validation-and-runtime-checks)。本文件不另设验证或复审门槛。

Task ID：`plugin/atria-mcp-strengthening`。本模块承接前八轮冻结范围，不替代各域规则。

## 决策来源

此前第九轮没有单独选项冻结；

## 阶段依赖

| 阶段 | 交付内容 | 依赖 / 必读域模块 |
| --- | --- | --- |
| E1 | Control/Read/Mutation/Browser Lane、有界调度、Operation Journal、Receipt、异常恢复 | E0；p0-reliability |
| E2 | SDK v2、2025 form / 2026 MRTR、协商、可信审批、可选 Tasks 与安全降级 | E1；|
| E3 || E1；package-library-media-skills-extensions、p0-reliability |
| E4 | Studio/Project Agent、Session/Save/长会话、Generation 生命周期 | E1/E2；studio-project-agent、session-save-generation-lifecycle |
| E5 | Runtime/Provider/Prompt、Memory/Goal/Evidence/Experience/Evolution | E1/E2/E4；两个相应域模块 |
| E6 | Package/Library/Resource Graph、Media/Speech/Mask/Gallery、Skills/Extensions/Plugins | E2/E3；package-library-media-skills-extensions |
| E7 || E1–E6；|

可先并行准备独立模块，再按上述依赖集成；各子代理独占文件，主代理负责共享 registry/kernel/server 和唯一 Record。长期分支不互相 merge。

## E0 当期契约差异

审计基线：产品 `9241325a7290e613e0fdaaa1870409105c161c89`，工具 `ee99b2b3d1c65502a971495a6016ccb7c195bf6d`。本表为静态证据，不是执行通过。

| 差异 | 实际来源 | 实施处置 |
| --- | --- | --- |
| 所有 tools 共用 FIFO；Executor 单个 busy 标志 | plugin src/server.js、kernel.js | 分 lane；不能只删除闸门|
| fork/retry 不在 Native command dispatch | plugin mutations.js；main native-session.js | 退役六项失效 action；保留 Save/Restore/Switch，明确无等价的意图不支持 |
| Session 当前 load 可同步 Regex/Knowledge 并 publish | main session-core.js:192；product-service.js Session GET ||
| Project Task get/list/context 可 recover/persist | main project-agent.js:396–466 | 纯观察与显式 reconcile 分开；READ 不调用恢复路径 |
| Experience inspect/reflection 会 reconcile | main experience-service.js:92–141、279 | 纯观察 port；维护/失效传播有独立效果动作 |
| Image status/list 会 worker.recover；Speech status 会 prune/deleteRef | main illustration-image-service.js、speech-service.js | snapshot 与恢复/维护分开，不凭名字标 READ |
| Evolution inspect / Prompt Preview 可能间接协调写入 | memory/model 两域已冻结源码链 | 纯观察/编译链隔离，保留独立有状态 reconcile |
| Package 1 MiB JSON / 16 MiB MCP handle / 128 MiB Native archive 不一致；Bundle 32 MiB | plugin read-authority.js/high-risk.js；main native-product.js/resource-bundle.js | 专用分块/stream/staging；不全局提高 JSON 限额；独立业务容量 |
| Library delete-safety 参数嵌套错误 | plugin high-risk.js 对比 main native-studio.js | 改为原生扁平 ref，增合同回归 |
| SDK v2 拆包版本不完全相同 | npm 官方 registry / 官方迁移文档 | 锁定真实发布依赖；stdio factory 双时代，按协商与请求 envelope 判断审批能力 |

已有 GoalContinuation 中可复用受管 Studio Agent executor；不把 beginGeneration 登记 attempt 当作实际发起模型。其余精确 Action schema 逐域核实后实现并附测试，不通过“列出工具”宣称完成。

## 工程参数

- 调度默认有界：Control 独立配额，Read 并发，Browser 单页串行；Mutation 锁以原生 owner/authority/target 为依据，保守扩大冲突范围可降低吞吐，不得错误缩小造成覆盖。所有上限是工程参数而非额外审批门槛。
- Journal 使用独立私有目录、实例隔离和原子替换，字段允许表、大小/条数界限；在 dispatch 前持久记录，重启只恢复元数据，不恢复 Lease 或重放输入。无法确认 dispatch 后结果保持 unknown。
- 长操作通过现有 semantic registry 的 operation namespace 查询/取消，固定 18 tools 保持不变；协议 Tasks 仅在实际协商后启用。
- 无证据者待验，不阻止可独立进行的工程工作。
