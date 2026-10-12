# Agent Intelligence Runtime — M5有限工程移交

2026-10-13 用户明确要求在M5本地工程自然边界换聊。按 [Governance §7](README.md#7-handoff) 刷新唯一交接；整体任务未完成，待监管核实停稳后创建一个新主聊天。本聊天退出写入，不自行创建新主。旧S21交接已替换，不重做M1/HM1或S27–S29。

## 实际Git与入口

- Task：`agent-intelligence-runtime`。主工作区 `D:/Dev/Atria-worktrees/tasks/agent-compute-runtime/source`，branch `feat/agent-compute-runtime`，HEAD/origin `a8272315332af99b8430f39d498ff0afcaee5a09`，干净；其中S30只有配置准备，未交付MCP消费者。
- docs：`D:/Dev/Atria-worktrees/docs`，branch `docs`。交接前HEAD/origin `59087024c762780228ff9e68440ce7464e4feccb`；本文、同一Record和S30模块一起提交/push后以实际Git为准，勿把前HEAD当最新。
- main：`D:/Dev/Atria`，`3ee1332ef113d4c57c65d9577222ba88d5171101`，未改。docs无关未跟踪 `plans/feat/agent-experience-evolution/` 保留，不stage。
- 恢复：实际Git/status → 本文 → [Plan index](plans/architecture/agent-intelligence-runtime/index.md) → [同一Record最新S27/S28/S29/工程移交节](records/refactor/agent-intelligence-runtime.md)。按需只读当前模块，不扫全Plans/历史/Skills。

## 已完成与证据边界

S21/S22、S23有限工程、S24双域比较、S25普通异步、S26可选留额均已push，详细结果/费用/失败归Record。M4真实provider、双域决策和quality-cost仍pending，新素材外传范围未解决，不改成通过。

S27 source `4fe3a172a`：原公开display→typed ExpressionPlan→prose，16新增/12受影响distinct PASS，原Host/预算/取消/source guard；loopback不是模型语义/风格验收。S28 `43a1505e2`：本地Windows SAPI→原辅助Scheduler/RunControl/AssetStore，18新增/4受影响PASS，其中真实WAV、实际spawn后kill/close取消、FS/SQLite/HTTP及跨消息exactvoice；没有播放声音，音质/细粒度时序/感知仍pending。S29功能 `05a18e6d4`/规范化 `293653079`：原readonly bridge安全五字段、exactPackage PNG/文字fallback，backend4及Chromium六组合PASS（component/hybrid/full×1440/390），原Conversation7/required media1受影响PASS。图片decode误标available已修复，full390损坏/恢复/旧事件复验，root实际截图QA通过，状态/费用只读。

原不利结果保留：S27首轮provenance长度/Actor-Task误插/fixture与费用断言失败后相关修复通过；S28 canonical actorId解析及fixture非法actorField两轮失败、并发cache/TTL/结算故障已修；S29实际decode失败、test EOF cached diff警告已修。不要重写为从未失败、普遍无泄漏、独立模型质量或完整M5验收。

## 下一行动：S30有限本地READ

先读 [delivery §7](plans/architecture/agent-intelligence-runtime/delivery.md) 与 [S30范围](plans/architecture/agent-intelligence-runtime/s30-local-mcp.md)。依赖原S02/S13，不因M4/M5外部证据pending自动停止独立本地项。S31–S34尚未实施，按真实依赖后续推进。

交接通知前原Route `executionPolicy.mcp` 已准备：固定`2025-11-25`、canonical connectionProfileId、tool/resource精确allowlist、auth none/secret；36新增+原contracts17 PASS、2文件ESLint及cached diff-check PASS，source `a82723153`已push。这只是strict配置，**没有MCP adapter/clientService/SDK Server/工具或resource调用**，不要算S30完成。

下一实现沿原owner ConnectionProfile/Route、Session公开item、TaskScheduler/RunControl，落实provider.mcp/transport.http、字面loopback/no redirects、exactSecretRef、源/预算/取消/unknown和外部provenance；外部payload不获World/Memory/Goal权限。默认不调用，SSE/未知版本/Apps脚本或callback能力明确unsupported。用真实SDK公开文字统计/临时公开resource验证，不启动连接用户数据的Atria plugin或stdio任意命令。

已核实独立临时SDK `1.30.1`，实际支持latest `2025-11-25`，未知requested版本会自动回退，客户端仍需exact核对；现代其它revision不能混称。SDK在本机临时根 `C:/Users/5insi/AppData/Local/Temp/atria-s30-sdk-d4adf0202e05400abb4a008495f7193b` 下，未运行Server。测试可经`ATRIA_MCP_SDK_ROOT`传路径，不把机器路径/依赖cache提交产品；若临时目录丢失按精确版本重准备即可，不重做旧阶段。清理前核实resolved目标确在该临时根，使用单一PowerShell/文件API，勿跨shell递归删除。

## 权限、保留与停稳

新素材producer/judge/诊断外发继续暂停；公开协议资料/依赖registry只读不等于素材发送许可。夜间不自动播放音频。只推送已授权任务代码/相关测试/正式docs到feature/docs，不merge/deploy，不扰动main、plugin或无关草稿。

私有Git `atria.private.directory` 当前为 `D:/Dev/Atria-private/Document`（已是Document，不双重拼接）。只保留当前API配置、最小滚动额度、阶段摘要；不打印/提交/上传凭据，不恢复旧备份/raw正文/永久历史账本。`carry148`只导入一次，不清零或重加；必要获准调用沿原`tests/agent-intelligence/private-test-run.js`自动2000/day、20RPM与临时清理，不私建ledger。

三个子代理已结束并报告无受控进程/请求仍运行；浏览器/Server测试已正常finally关闭，root同步命令结束后只作Git/交接核验。未建Codex Goal，无在途素材/API调用或旧主写入。新聊天须在监管核实本聊天停稳后唯一创建，沿原主工作区接续；交接本身不是阶段验收通过或整个路线停止条件。
