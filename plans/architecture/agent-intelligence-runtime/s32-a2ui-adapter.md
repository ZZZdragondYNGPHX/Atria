# S32 — 有界 A2UI 公开任务卡导入

本页管理一个有限 A2UI 消费者；不将其扩大为完整 AG-UI、在线流式 UI 或远程 MCP Apps 支持。

## 基本版在线消费（2026-10-13）

source `877564dfa`：Source Index的a2ui声明可选stream:true；exact IR保留作者原actions、初始public surface和降级信息。Host使用原runtime.streamA2ui(instanceId, response.body, {signal,onAction})消费JSONL，不把Body/回调交给Package脚本。支持component更新、data子路径、重建同surface/删除；每次projection沿原允许组件/Bridge schema，公开信息不能读取Native/private状态。原renderer分阶段替换DOM、保留焦点和最后有效视图；取消/dispose/epoch/revision使晚到更新失效。成功用户点击仍走原Bridge，并可回传标准v0.9.1 action envelope。客户端不自行选择remote endpoint/Secret。下方首批矩阵中JSONL/增量路径/event回传的未支持项由本节替代，OAuth/Apps/多surface仍不声明。

## 当前用途与边界

作者将一份公开 A2UI 任务卡消息批次作为 `.a2ui.json` 组件源加入现有 Native Source Index。正式 Project Build / Studio Preview 使用同一 `compileFrontend`，降为原 Native v3 IR；

当前实际用例是展示公开任务说明，并由用户点击“确认公开备注”，调用作者已声明的原 Application command。协议消息只供应卡片文本、有限数据与事件 context；允许的事件名→Bridge binding 映射保存在单独的作者 Source Index。没有新 writer、隐藏 Task/Goal、模型调用、远端目录下载或自动外发。确认不等同于任务完成。

采用 A2UI `v0.9.1` 的有界子集。该版本目录中的 basic catalog 仍声明 `https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json` 为身份；源码固定此值，不从 URL 获取资源。

## 固定支持矩阵

| 范围 | 当前支持 | 明确不支持 |
| --- | --- | --- |
| 消息 | 单一 surface 的 `createSurface`、有限 `updateComponents`、根 `updateDataModel` 替换、最终 `deleteSurface` | 在线 JSONL transport、多 surface、删除后重建、任意增量路径 |
| 组件 | `Text`、`Column`、带可见 Text label 的 `Button` | 未知组件、图片/URL、脚本、函数调用、动态列表、HTML/Markdown 执行 |
| 数据 | 静态 JSON 原语/有界对象；`/path` 只从消息自身 data model 解析 | Native snapshot、World/Actor 私有状态、Host/凭据或任意表达式读取 |
| 交互 | `action.event.name/context` → 作者允许的 binding/input → 原 `action.invoke` | 上游 A2UI action envelope 回发、动态权限、未声明 binding、自动执行 |
| 兼容 | 仅生成已有 Native v3 IR；既有 v3 客户端无需 A2UI renderer；`interactive:false` 编译为无 `uses` 的文字 | 不宣称 Native v2 或任意旧协议客户端兼容 |
| 撤回 | source 更改须原重新 Build/发布；`deleteSurface` 使用作者文字 fallback| 晚到协议消息热改现有 Session、协议来源直接 publication |

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
- `src/native/frontend/authoring.js`：Studio inspection 可定位源；生成节点只读，防止 Native AUI span editor 错写 JSON；作者仍可经原文件编辑/Build 修改消息。
- 原 `FrontendBridgeService`、`SessionCore.applyLifecycleCommand`、Native runtime 不新增权限分支或 writer。
