# S30：有限本地 MCP Tool/Data 消费者

状态：2026-10-13 M6首批本地READ范围与可选配置准备，source `a82723153`，消费者/真实协议出口未实施；用户换聊交接后继续。依赖原S02/S13工程消费者；M4/M5未取得的模型语义/质量收益不改写完成。本组拟只接由owner原ConnectionProfile/Route显式配置的loopback HTTP MCP服务，使用临时公开fixture的真实SDK工具计算和资源读取验证。不启动连接用户资料的Atria plugin，不增加外部模型/素材发送、OAuth范围、stdio命令执行或MCP Apps脚本/HTML执行。

固定协议`2025-11-25`，采用其[initialize/initialized与exact版本协商](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)、[tools/list/call](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)及[Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)的JSON响应子模式。不是当前其它revision的通用兼容实现；SSE/未知revision/回调能力明确unsupported。核实独立临时SDK1.30.1实际latest为该版，SDK未知requested version会回退，客户端仍须exact核对，不能把fallback当兼容证明。

配置唯一沿原player ConnectionProfile（provider.mcp/transport.http）与原RuntimeRoute executionPolicy可选mcp声明，绑定connection id/protocol/工具及资源精确allowlist。默认无声明不调用；不因server readOnlyHint、模型自报许可、连接成功或工具发现获得本地权限。首批限定READ-only服务及公开文字参数：服务器从当前Session原player/display view选exact item的text/content，不允许caller自由text、端点、headers、Secret或原private cognition。服务URL只允许字面loopback、拒userinfo/redirect；按配置选择无认证本地服务或原exact SecretRef，不复制浏览器cookie/auth。

沿原辅助TaskScheduler、RunControl本地工作与scope/revision/Route/Connection freshness计量准入，每次实际协议操作有界、失败/取消/unknown不自动retry、不退款。取消通知与HTTP关闭不证明远端副作用已撤销；远端结果、工具提示和resource内容都是有来源的外部数据，不写World/Memory/正式Task结果或Goal完成。输出有界text/JSON及profile/protocol/source/input/output fingerprints，拒绝自动跟随resource link/HTML/脚本/任意新server request；没有第二套connector权限、receipt或预算ledger。

真实本地provider选择SDK注册的有界公开文字统计工具与临时公开resource，以实际计算/文件读取验证握手、发现、调用和provenance；不是固定response mock。独立SDK依赖仅在temp目录，精确版本、禁安装scripts、不改repo lock/config，测试后清理；产品adapter不依赖该机器路径。验证工程权限/预算/取消/来源失效与原consumer，共享owner authority保护；真实远程服务/OAuth/交互Apps仍pending，不能由本地SDK测试冒称交付。
当前仅原assertExecutionPolicy新增mcp严格shape：protocolVersion、connectionProfileId、toolNames/resourceUris最多各8且至少一类非空、auth none/secret。36新增及原contracts17受影响PASS、2文件ESLint/cached diff-check PASS；没有clientService准入、adapter、SDK Server或真实工具/资源请求。ConnectionProfile的provider/transport/literalloopback与SecretRef、原预算/取消/unknown须在消费者继续落实，不能以配置schema代替权限或协议证据。
