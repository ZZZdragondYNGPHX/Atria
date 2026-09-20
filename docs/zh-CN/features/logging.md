# 日志与诊断系统

Atria 现在以 Diagnostic Incident（诊断事件）为核心，而不是让用户自己从整份原始日志里找问题。

## 诊断工作台

入口：用户设置 → Diagnostics / 诊断。

- Guided：默认模式。显示最近故障、模块健康、归因证据、关联 ID、原因链，并可复制故障摘要或完整上下文。
- Startup：查看最近 StartupSession，对比 Server / Client / Extensions 耗时、慢阶段、单扩展耗时、SVG 环图与瀑布时间线。
- Expert：查看结构化前端/后端日志，可按模块、级别、关键词过滤，支持增量刷新和虚拟化渲染。

手机端使用“列表 → 详情”的专门布局，不会把桌面三栏硬压到窄屏。

## Diagnostic Incident

Incident 可以保存故障类型、阶段、严重程度、关联 ID、原因链、关键日志、最近用户操作、安全配置、retry/fallback 历史、provenance 和基于证据的归因。

归因对象包括 Atria、SillyTavern 上游、第三方扩展、服务器插件、外部服务、网络/本地环境、用户配置和 unknown。是否有插件参与调用不会被当成归责证据。

故障发生后可点击“我刚遇到问题”，把最近一小段证据固定成 Incident。

## 已覆盖的高价值故障链

结构化诊断已经覆盖启动、WebSocket、generation/dispatch、智能体编排、Memory Graph、世界书、存储、LAN Sync、备份恢复、扩展安装/更新、server plugin 运行时以及 Editor/Studio。

扩展安装/更新失败可以区分 DNS、TLS、连接/超时、Git、HTTP、manifest、文件系统和仓库冲突。

智能体编排 Incident 可以保留 run / agent / round / provider / model / tool / schema / retry / fallback，而不会复制完整 prompt 或聊天正文。

## 启动分析

Atria 最多保留 20 个紧凑启动会话，可查看 server phases、client 启动区间、extension discover/manifest/activate、单扩展 script/style/locale/hook 耗时、慢项、会话 delta 和 waterfall。

图表使用原生 SVG，并且只在第一次打开 Startup 页签时按需加载。

## 单一数据源与兼容性

后端只有一个 bounded canonical log store。Atria 自有前端代码直接使用 public/scripts/logging 下的新模块。

public/scripts/frontend-log-manager.js 仅作为第三方/上游兼容 shim 保留。

## Debug Export

Debug Export 与 Diagnostics 共用 canonical 数据源，可按权限包含 frontend logs、管理员 backend logs、安全化 Request Inspector 元数据、Incidents、StartupSessions 和 provenance。

完整 prompt、完整消息正文和完整 response body 不会进入诊断导出。API Key、Authorization、Cookie、OAuth/JWT/Bearer、密码等统一中央脱敏。

普通用户不能读取进程级全局 backend raw logs；Incident/StartupSession 按用户隔离；backend raw query/clear 仅管理员可用。

## 推荐报错流程

1. 重现问题；
2. 打开诊断；
3. 选择最新 Incident，或点击“我刚遇到问题”；
4. 优先复制故障摘要；
5. 只有需要更多证据时再复制完整上下文。
