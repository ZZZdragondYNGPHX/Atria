# 雾灯旅舍

温暖、克制、带轻悬疑的海岛群像冒险。你临时代管旅舍三天，为四位客人安排可靠的去处。人物采用二次元动漫立绘，场景、图片与环境音随作品提供。

本目录包含完整游戏源码、27 张选用插画及 PNG 制作原件、19 项声音、构建与验证工具。2026-10-15 已恢复真实模型联测：MiniMax 中国区连接可用，开局旁白、一次意图识别和四名人物边界回应的最终六次调用通过结构与状态隔离检查，并作文字复核。三天全部剧情的模型自然度仍未完整验收；其余标记为模拟的检查不作为真实模型证据。

当前候选为 [1.0.0-rc.4](releases/foglight-inn-1.0.0-rc.4.atria)，约 20 MB；历史候选包保留。配套产品已合入 `main@493ed814b`。版本、校验值与验证边界见 [发布记录](releases/README.md)。

## 安装与游玩

1. 使用包含本作配套改动的 Atria 版本，支持 Native Frontend v3、`frontend-audio@1` 及类型化 Computation 结果引用。
2. 在 Atria Library 导入 `releases/` 中的 `.atria` 文件，授予作品声明的生成权限。
3. 为旁白、意图理解、人物闲聊三个槽位绑定现有可用模型路由；可以共用同一路由。作品包没有密钥，也不需要游玩时生图。
4. 创建普通模式进程开始。重要安排先看预览再确认；普通移动和阅读免费。三晚配给独立确认，未处理的配给可以保存并恢复。

菜单提供新存档、恢复、只读历史、声音/大字及退出。文件导入导出沿 Atria 的 Play / Library 存档管理办理。存档依赖原始作品包的精确版本与内容哈希，请保留实际发布文件，不以重新构建的同版本文件替代。

## 源码与制作

- `runtime/`：正式状态、闭合动作、人物日程、故事与有限披露；由 Host 的 Lifecycle 与 Authority Transaction 保存、裁定。
- `frontend/`：AUI、受限控制器与 CSS，只投影正式状态。自由输入只生成候选，不能直接改世界。
- `media/`：正式图片和声音、来源清单。字体使用系统字体回退，不下载外部字体。
- `tools/`：构建、真实 Core 安装/存档验证、实际 Native 挂载和浏览器验证。模拟环境不写入用户的真实 Atria 数据。
- `validation/`：实施验证说明与完整功能映射。临时截图、请求/响应和运行数据不作为永久开发资料保留。

构建需要本地 Atria 源码和其依赖：

```powershell
node tools/build.mjs --core <Atria-source> --out releases/<new-version>.atria
node tools/verify-rules.mjs --core <Atria-source>
node tools/verify-story.mjs
node tools/verify-portable.mjs --core <Atria-source>
node tools/verify-portable.mjs --core <Atria-source> --archive releases/foglight-inn-1.0.0-rc.4.atria
node tools/verify-model.mjs --core <Atria-source> --api-config <private-config.json> --quota <shared-rolling-quota.json> --archive releases/foglight-inn-1.0.0-rc.4.atria
node tools/serve.mjs --core <Atria-source> --port 18741
node tools/verify-ui.mjs --playwright <Playwright-module> --chrome <Chrome-executable> --url http://127.0.0.1:18741
```

构建拒绝覆盖已有发布文件。后续内容或产品兼容修改应发布新版本，保留历史包。图片制作方式、提示说明见 [生成记录](media/image-generation.md)，声音来源和加工见 [CREDITS](CREDITS.md)。
