# S32 — 有界 A2UI 公开任务卡导入

执行与验证只归 [Governance](../../../README.md)，阶段依赖和完整出口见 [delivery §7](delivery.md#7-m5--m6--m7--后续可替换能力)。本页管理一个有限 A2UI 消费者；不将其扩大为完整 AG-UI、在线流式 UI 或远程 MCP Apps 支持。

## 当前用途与边界

作者将一份公开 A2UI 任务卡消息批次作为 `.a2ui.json` 组件源加入现有 Native Source Index。正式 Project Build / Studio Preview 使用同一 `compileFrontend`，降为原 Native v3 IR；安装与运行仍由原 Package validator、FrontendBridgeService 和 Native runtime 管理。

当前实际用例是展示公开任务说明，并由用户点击“确认公开备注”，调用作者已声明的原 Application command。协议消息只供应卡片文本、有限数据与事件 context；允许的事件名→Bridge binding 映射保存在单独的作者 Source Index。没有新 writer、隐藏 Task/Goal、模型调用、远端目录下载或自动外发。确认不等同于任务完成。

采用 A2UI `v0.9.1` 的有界子集。2026-10-13 核对官方 [server-to-client schema](https://raw.githubusercontent.com/a2ui-project/a2ui/main/specification/v0_9_1/json/server_to_client.json)、[client event schema](https://raw.githubusercontent.com/a2ui-project/a2ui/main/specification/v0_9_1/json/client_to_server.json) 和 [basic catalog](https://raw.githubusercontent.com/a2ui-project/a2ui/main/specification/v0_9_1/catalogs/basic/catalog.json)。该版本目录中的 basic catalog 仍声明 `https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json` 为身份；源码固定此值，不从 URL 获取资源。

## 固定支持矩阵

| 范围 | 当前支持 | 明确不支持 |
| --- | --- | --- |
| 消息 | 单一 surface 的 `createSurface`、有限 `updateComponents`、根 `updateDataModel` 替换、最终 `deleteSurface` | 在线 JSONL transport、多 surface、删除后重建、任意增量路径 |
| 组件 | `Text`、`Column`、带可见 Text label 的 `Button` | 未知组件、图片/URL、脚本、函数调用、动态列表、HTML/Markdown 执行 |
| 数据 | 静态 JSON 原语/有界对象；`/path` 只从消息自身 data model 解析 | Native snapshot、World/Actor 私有状态、Host/凭据或任意表达式读取 |
| 交互 | `action.event.name/context` → 作者允许的 binding/input → 原 `action.invoke` | 上游 A2UI action envelope 回发、动态权限、未声明 binding、自动执行 |
| 兼容 | 仅生成已有 Native v3 IR；既有 v3 客户端无需 A2UI renderer；`interactive:false` 编译为无 `uses` 的文字 | 不宣称 Native v2 或任意旧协议客户端兼容 |
| 撤回 | source 更改须原重新 Build/发布；现有 owner/epoch/revision/scope/撤回继续校验；`deleteSurface` 使用作者文字 fallback | 晚到协议消息热改现有 Session、协议来源直接 publication |

消息源最多 64 KiB / 32 条，最多 64 个组件、树深 16；data model 深度 8、每层 64 项；文字最多 4096 字符，交互 input 最多 4096 字符并经过原 binding schema。树循环、重复/共享/不可达节点拒绝。当前 busy/error 反馈使用原 presentation path，因此 action target 不接受含点号的 binding ID，错误显式拒绝，不静默失去反馈。

Source Index 中的组件声明示例（对应 Bridge 仍须已有合法的 `save` action）：

```json
{
  "id": "External",
  "source": "External.a2ui.json",
  "a2ui": {
    "actions": { "confirm": "save" },
    "interactive": true,
    "fallbackText": "这张任务卡已关闭，请继续使用原文字界面。",
    "feedback": {
      "pending": "正在确认…",
      "failed": "确认未完成，请刷新后重试。"
    }
  }
}
```

`External.a2ui.json` 保存官方消息对象的 JSON 数组，编译其最终静态投影。`interactive:false` 是作者显式的文字兼容选择；不会建立任何交互 capability。未知协议/组件始终拒绝，不借 fallback 接受未经支持的权限或结构。交互卡要求作者提供可本地化的 pending/failed 文本，使用原 busy state 禁用按钮并由 `role=status` 宣告。

## 源码与真实消费者

- `src/native/frontend/a2ui-adapter.js`：严格消息解析、有限 data binding、静态 IR 降级与 action map。
- `public/shared/native-frontend-contract.js`：Source Index import policy；原 installed contract 不变。
- `src/native/frontend/compiler.js`：原正式编译入口选择 adapter，保留 exact source hash / provenance。
- `src/native/frontend/authoring.js`：Studio inspection 可定位源；生成节点只读，防止 Native AUI span editor 错写 JSON；作者仍可经原文件编辑/Build 修改消息。
- 原 `FrontendBridgeService`、`SessionCore.applyLifecycleCommand`、Native runtime 不新增权限分支或 writer。

## 当前验证

2026-10-13 完成有限工程出口，未执行模型或业务外发：

- `tests/native/a2ui-s32.test.js`：24 distinct PASS。包括正式 Project Build、不可执行文本、未知组件/事件/数据路径、边界限额、Studio inspection，以及 FS/SQLite 安装后原 Bridge 的幂等、真实 revision、过期/撤回/cross-owner 拒绝。
- 受影响既有 `frontend-v3`、`frontend-authoring`、`frontend-bridge`：65 distinct PASS。
- `tests/frontend/a2ui-s32.smoke.mjs`：真实 Edge headless，1280 / 390 两组 PASS；键盘焦点/Enter、44px 按钮、处理中禁用、同一用户点击的真实 command 与 revision、过期请求错误提示、旧 v3 runtime 与文字/删除 fallback。外网请求 0；没有模型、用户数据或真实外部业务操作。
- 最终截图在本机临时证据目录，具体路径归本轮 Record；图像人工读取确认无窄屏溢出、可见状态反馈和公开备注。测试/生产变更执行 targeted ESLint；历史 lint 不重写。

这证明当前固定本地导入与原交互权限链。未验证在线 AG-UI/A2UI transport、上游 Agent 的 UI 生成质量、MCP Apps、远端身份/OAuth；不以此把完整 M6 或整个长期任务标为完成。
