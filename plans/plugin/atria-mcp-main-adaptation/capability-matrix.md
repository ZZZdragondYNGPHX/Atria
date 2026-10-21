# 当前主线能力覆盖与适配矩阵

从 [index.md](index.md) 进入；版本边界引用 [decisions.md](decisions.md)。本表是范围与覆盖状态的权威，详细合同归对应领域模块。

## 当前矩阵

| 领域 | 当前实现 | 合同边界 | 验证状态 |
| --- | --- | --- | --- |
| V3 编排 | Native Plan / Revision / Dependency / Binding、原域入口、Run / Effect / Approval、A 续接与 ready resume | [V3 模块](orchestration-approval.md)；未知派发只观察，不重置重发 | 双 Backend 原生批准/拒绝/过期及业务提交通过；恢复/取消/重启边界针对测试通过 |
| Runtime / API Preset / Prompt | 当前 SecretRef、原子 API 保存、used-by/archive/delete、draft preview、trial operation、candidate discard | [领域 §2](domains-acceptance.md#2-runtime--api-preset--prompt)；trial unpublished，Plan 候选沿原 Binding | 双 Backend 共享资源隔离、旧 CAS 原子拒绝、零发送预览、单次试跑及丢 ACK 观察通过 |
| Project Agent / Studio | 保留 direct 工作流，formal_commit 使用原生窄入口、纯预检与业务 Receipt | 两类提交分别披露；不从 V3 自动回退 direct | Studio evaluation/apply、Preview smoke 与双 Backend formal commit 通过 |
| Session / Chronicle / Archive | 时态字段和两类 cursor、原 Save/Branch、共享 importability 预检和 staging cancel | [领域 §3](domains-acceptance.md#3-world--session--chronicle--archive)；原格式、原目标、原 closure | Save/Branch smoke、双 Backend 原容器/Memory 往返、Chronicle 时态和 cursor 失效通过 |
| World / Cognition | 初始化前 world preview、可读 view/anchor 目录、disclosure/inspection、两类 hypothetical | 原 source hash 和 audience；候选本地计算、不发布 | 双 Backend 玩家/inspection 分离、Actor view 拒绝、旧 anchor/source 失效及 transaction/clock 候选通过 |
| Memory / Goal / Evidence / Experience / Evolution | Graph 原权威；声明 Lifecycle 目录/preflight；Plan targets、Goal context/associations、quality/prediction/comparison | [领域 §4](domains-acceptance.md#4-memory--goal--evidence--experience--evolution)；没有 acquired 裸 CRUD 或自动学习旁路 | Graph smoke、双 Backend Memory acquisition/保护/Archive、Goal create/context 通过；Plan target/Binding/收紧限制针对测试通过 |
| Storage Center / 删除 | 原生 snapshot/detail、六类 preview/execute、tasks/stop；delete 回执明确 trash | [领域 §5](domains-acceptance.md#5-storage-center--media--binary)；preview 持久化，purge/clean/repair 为 DESTRUCTIVE | 双 Backend trash/restore/purge、原依赖/恢复根拒绝通过；无原始存储旁路 |
| Media / Speech / Binary | 独立作者 txt2img、gallery 分页/归档、image/thumbnail Binary，保留 Session 媒体 | 两类 scope 和原 job；作者编辑器不在原生支持范围 | 双 Backend 本地 WebUI Provider 与完整 bytes 通过；owner/client/purpose/boot/range/source/TTL 针对测试通过 |
| Skills / Extensions | 当前资产 scope、bundled/embed 固定包装、偏好和 illustration 配置 CAS；Extension 回收语义 | [领域 §6](domains-acceptance.md#6-skills--extensions--资源资产)；Package 原件只读，资产不等于 invocation 授权 | 双 Backend bundled/完整 embed 导入通过；既有 reviewed install/CAS 权威保持 |
| Browser / Semantic UI | 当前 Shell、Session/Preview scoped evidence、本地编译 controls 与截图 | [领域 §7](domains-acceptance.md#7-browser--mcp-基础设施)；复杂 Surface 无 controls 继续用正式 API | 桌面/390px 窄屏、Preview/Session、重启 STALE/reload CURRENT 通过；测试挂载与完整 Shell 分开报告 |
| MCP 基础设施 / 诊断 | 0.4.0、18 tools、473 actions、Journal 原身份、可释放调度与独立 Binary | 授权和正文不写 Journal；READ 无持久 reconcile；退役动作明确报错 | 语法及针对测试通过；实际 Codex 工具/READ/JPEG 与 Claude 连接通过；已集成交付 |

## 调查来源

第一轮直接对照 `plugin:atria-mcp/src/**` 与 `main:src/endpoints/native-*.js`、相应 `src/native/**`、`public/shared/**` 和 `public/scripts/native/**`。主要明确失配包括：

- `plugin:atria-mcp/src/agent-delegation.js` 的旧 browser Orchestrator，与 `main:src/endpoints/native-orchestration.js` 的当前入口。
- `plugin:atria-mcp/src/runtime-actions.js` / `delegated-generation.js` 的 credential permit 假设，与当前 generation preflight / SecretRef 验证。
- `plugin:atria-mcp/src/session-actions.js` 的 Chronicle schema，与 `main:public/shared/native-history-runtime.js` 的时态查询和事实游标。
- `plugin:atria-mcp/src/high-risk.js` 的物理删除回执，与产品 `recycleNativeResource` / Storage Center 生命周期。
- `plugin:atria-mcp/src/skill-actions.js` 的 `orch-preset` 与当前 `main:src/skills/scope.js`。

实际执行命令、失败诊断、证据范围和最终交付 HEAD 统一见 [Record](../../../records/plugin/atria-mcp-main-adaptation.md)。未执行的外部客户端真人审批、付费 Provider 与设备不属于已验证事实。
