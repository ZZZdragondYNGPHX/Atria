# 斗破苍穹·众生行 — Native 后端

Task ID：`package/doupo-living-world`。当前为后端开发构建，正式原生前端与美术由后续集成阶段制作；`design-reference/` 属于另一个设计对话。

作者源位于 `source/`，构建器位于 `tools/`，版本以 `package.json` 为准。游戏规则、公式、原创人物与小说资料的区别见 [设定来源](source/content/SOURCES.md)。实施与验证事实归 `docs:records/package/doupo-living-world.md`；F01–F12 接线以 `docs:plans/package/doupo-living-world/frontend-contract.md` 的实际映射为准。

构建：

```sh
node tools/build.mjs --core /path/to/Atria --out releases/doupo-living-world-0.1.0-be.1.atria
```

需要具备本任务原生接纳扩展的 Atria 源码版本：有界 collection read grants、computed 数组元素引用、computation 的真实 anchor 与 invariantContext，以及 Subject 关系目标接纳。当前 checkpoint 来源为 `feat/doupo-native-authority@6e44cf85969fff3038eec5a16957b0919ff17521`，仍未集成 main；未修补的 `f9a8a8382` 不能安装此包的完整 Game Logic。构建器直接调用 Atria 的 `buildAtriaPackageContainer`，不携带源码依赖或凭证。容器带随机盐与 nonce，因此重建按明文内容与 Package 版本核对，不能要求加密归档逐字节相同。`--out` 使用独占创建，保留已有版本。

原生载入顺序为安装容器并授予 generation 权限 → 创建 Session → `experience.ready` → 三次 `doupo.bind0/1/2` 新局身份初始化 → `doupo.act` 创建角色。长期活动与重大决定使用 `doupo.choice`，沿用同一规则实现并在动作前自动保存；`continue` 使用 `doupo.act`，不会为每个结算片段另建自动存档。初始化通过原生 Subject 声明取得身份，禁止推算 Session 派生 ID 或在前端创建人物。所有正式操作经 NativeGenerationHost/SessionCore 的事务、CAS 与收据提交；没有独立 HTTP 服务或浏览器本地世界存储。

玩家读取 Information view `player` 的 `screen:main`，`data.screen` 是 JSON 编码的玩家投影；解码结构见 `tools/schema.mjs` 的 `view`。数据只包含角色可见范围。NPC 使用 Subject 的真实个人 view，不能把 `dw_world`、`dw_people` 或所有个人信息送入浏览器。

长期活动和个人评价可产生后续 `continue`，以投影中的 `operation` 判断；每段真实提交后重取投影。停止不会倒退已提交时间、物资与经历。保存和恢复使用原生 SavePoint/Branch；恢复后丢弃旧分支动作与生成结果，并重新绑定界面目标。

模型连接由宿主的 Runtime Route 提供，Package 不含 endpoint、密钥、调用账本或测试输出。使用支持工具调用及 JSON schema 输出的 OpenAI compatible 连接；`role.intent_resolver`、`role.narrator` 和任务槽 `narrative`/`npc` 必须接到实际路线。GGchan 已按用户指示停用，不作为本任务的配置默认值或建议。

测试实现、fixture、临时数据、请求响应、日志和截图只在本地临时工作区；不提交到 package 或源码分支。正式发布文件仅在完成相应验证后写入 `releases/`。

当前仍有待验证或补齐内容：完整恢复与迟到结果、人口上限与并发接纳、跨年负载、历史人物查询，以及避免每个内部 `continue` 都经 Bridge 调用叙事模型的实际接线。已接入原生 History checkpoint 处理回执增长，尚需跨过原失败点的长时重跑。此 checkpoint 不是后端完成声明。
