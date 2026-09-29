# UI 权威与交互边界

- 以当前 `frontend`、`frontend-aui`、`frontend-bridge` 和 `frontend-guide` catalog 页面为字段与能力权威；不得从名称猜测未实现 API。
- Source Graph 定义 Views、Components、Package CSS、静态资源与 Bridge。示例不是整个可导入 Project；Component 示例的 `chat.footer` 不能机械用于 Hybrid/Full，应使用其合法 layout surface。
- UI/Draft/Prefs/Controller heap 不是游戏 Authority。业务状态只经正式 typed target、revision guard 与稳定 invocation receipt；不裸读 DB、不建立 generic durable KV。
- Bridge 的 Component `uses` 是能力闭包；不伪造 target 或在超时后自动换 ID 重放写入。保留 Operation Lifecycle intent、Epoch revocation。
- Conversation 的 committed Timeline 与 provisional streaming 分开。原始 HTML 不能作为 Safe Prose 执行。
- Script 通过 Supervisor Worker/QuickJS 与 scoped handles 运行，没有 window/document/fetch/storage。Canvas 是受控 command buffer，不取得 Host DOM。
- route/media/boundary/VM generation 是局部生命周期，不是 Authority Epoch。VM 重启保留 Host state 与 Session authority，不自动重放写入。
- Preview 使用正式 Compiler/Renderer 与 readonly transport，不借用私人 Play DOM 或 Session 写权限。
