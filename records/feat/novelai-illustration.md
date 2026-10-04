# 官方生图插件 — Record

- Task ID: `atria-novelai-illustration`
- Primary Workspace: main 产品源码 / `feat/novelai-illustration`
- Status: Active
- Plan: [入口](../../plans/feat/novelai-illustration/index.md)

## S1 — 内核基础

- Start HEAD: `084089d41`
- End/Tested HEAD: `2043e052f`
- Status: Complete（仅 S1；整个任务仍 Active）
- 实施分支: `feat/novelai-illustration`，独立产品 worktree

### Decisions

用户已经多轮确认并授权开始。单标注、提示词/图片两步、NovelAI 双接口、角色库/预设和停用后插图保留等冻结规则见 Plan。原 main 的 AGENTS.md 与 docs 的治理/模板 dirty changes 不属于本任务，不提交。

### Completed

- 独立实现共享标注/图片 contract、opaque ID、准确正文范围/选文校验，禁止切开 surrogate pair。
- SessionRepo 基于现有 state records 保存呈现状态，分支 head 与 SavePoint 快照隔离；CAS、现有 session 写锁保护并发更新，正文 publication 保留最新记录。
- `IllustrationService` 与 Native Session HTTP 入口提供创建/删除标注、登记图片历史、选择展示版本；不修改正文或推进剧情。
- AssetStore 的引用/删除保护包含当前及各分支历史与 SavePoint 图片；锁在存储事务外获取，覆盖图片登记/删除竞争和导入。源文 revision 接入历史可达与 GC。
- Host Safe Prose 有 canonical selection 映射；Host Conversation 在标注结束段落下方呈现一个选中版本，保留正文节点与文本选择，图片具备尺寸/替代文字/懒加载。
- snapshot、session、ironman resume 导出/干净存储导入保留标注/图片；源文、状态 hash、资产及选中版本归属校验。历史分支保存不会采用当前分支的图片。
- 恢复同一正文 HEAD 的不同图片状态也派生分支，原分支后续图片继续保留；删除标注不删除图片历史，迟到图片不复活已删除标注。
- 产品提交已推送到 origin/feat/novelai-illustration。

### Validation

- 本地 7 套相关 Jest 测试通过：illustration-core、illustration-renderer、session-runtime-http、frontend-prose、session-core.contract、save-system、asset-delivery-p5。首次整组收尾验证 76 项通过。
- 最后增加历史分支保存回归、修正保存来源后，只重跑受影响的 3 套（illustration-core、save-system、session-core.contract），52 项全部通过；相关覆盖合计 78 项，无需重复未受影响的套件。
- 源码与测试触及文件 ESLint、`git diff --check` 通过。
- 使用现有本地 Node 22.23.3；默认 Node 24 与已有 better-sqlite3 ABI 不符，初次 SQLite 检查失败后改用匹配的本地运行时，未重建或修改公共依赖。FS/SQLite 实际执行；MySQL/PostgreSQL 用例明确关闭。
- 未运行远程 CI、构建、真实生图请求、浏览器交互或手机真机检查。

### Known limitations

- S1 是内核基础，尚无可操作的生图模式、官方插件卡片/配置界面、LLM 提示词请求或 NovelAI 请求。
- Host Conversation 已接入段落插图；自定义 Package prose surface 的 SDK/集成方式由 S2 按其已有边界补齐，不能任意改写 Package DOM。
- 参数快照限定为非秘密 JSON；第三方 NovelAI 的实际协议仍待 S4 核对。

### Next checkpoint

S1 commit/push 后停止。下一目标是 S2：沿同一分支完成官方插件注册/SDK、双模式选择与单标注卡片、全局角色库及作品启用清单、预设与配置持久化。只读 Plan index/core/plugin 和本 Record，再读直接相关代码；不重开已冻结产品讨论。
