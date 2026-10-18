# S31：A2A协议与持久身份基本版

2026-10-13 补齐 source `877564dfa`：允许原保存配置的HTTPS，固定JSONRPC/1.0与原公开source/skill/auth契约；已获Task/context身份在原RunControl同anchor operation中持久化。默认保留7天；FS/SQLite冷Engine+新Scheduler恢复有实际GetTask证据，只允许显式查询/取消，不重发未知SendMessage。不把远端完成当本地正式结果。API start返回sessionId，status/reconnect/cancel在冷恢复时携带sessionId+operationId。

以下首批快照中的loopback-only与transient-only已由此基本版替代，历史失败保留在Record。

# S31：固定 A2A 1.0 的有限本地远端任务

首批依赖 S30 的原 owner ConnectionProfile/Route、公开 source、Scheduler/RunControl 与 S12 本地 evidence 权威。默认不发送；不启动连接用户数据的服务，不增加外部业务 Agent、OAuth、push callback 或任意文件下载。

原 ConnectionProfile 显式 `provider.a2a`/`transport.http`，原 Route 可选 `a2a` 声明 exact connection、protocolVersion `1.0`、auth none/secret 和有界精确 skillIds。Agent Card 只从同一配置 origin 的标准 well-known 路径读取，固定 JSONRPC/1.0 的 exact endpoint；远端 card/skills 不获得本地权限，未知版本/绑定或 required extension 明确 unsupported。认证只取原 owner exact SecretRef，不复制浏览器凭据。

只发送当前 Session 原 player/display view 的 exact item text/content。`SendMessage` 用服务器生成 messageId，`GetTask` 只重连已由该 owner 原操作取得的 task/context identity，`CancelTask` 只针对同一远端 task。消息、状态、artifact 限定有界公开 text/JSON投影；file、URL、脚本、私有 state 和自动 follow-up 不消费。任务状态、message/artifact/source/input/output fingerprints 作为外部 evidence；远端 COMPLETED 不完成本地 Goal、正式 Task 或作品状态。

每次真实 card/protocol 请求沿同一预算、scope/revision/Route/profile freshness；取消保留已发生费用，远端取消响应不证明副作用回滚；未知结果不自动重发 SendMessage。可重建服务对象时读取同一原操作中的已获 task identity 并显式 GetTask，不创建第二套任务或 connector ledger。进程丢失后的持久恢复缺口必须如实说明，不能将 transient 重连称为完整重启保证。
