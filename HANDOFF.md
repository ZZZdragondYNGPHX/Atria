# Live HANDOFF

## Task

- Task ID: `atria-novelai-illustration`
- Primary Workspace: main 产品源码
- Current branch: `feat/novelai-illustration`（独立产品 worktree）
- Current HEAD: `2043e052f`，已推送 origin
- Current stage: S1 Complete，S2 尚未开始
- Plan entrypoint: `plans/feat/novelai-illustration/index.md`
- Next-stage required modules: `core.md`、`plugin.md`
- Record: `records/feat/novelai-illustration.md`

## Completed

正式 Plan 已建立。S1 完成准确源文锚点、分支隔离的版本化呈现状态、标注/图片服务及 HTTP、Host 段落插图、AssetStore 引用保护、存档/导入/恢复/ironman resume。正文和剧情 authority 保持独立。迟到图片支持原分支登记，删标注保留历史。

产品提交 `2043e052f`；本阶段按治理停止，不进入 S2，不合并 main。

## Validation

7 套本地相关测试 76 项通过；最后历史分支保存修正后，仅重跑受影响的 3 套，52 项通过，相关覆盖合计 78 项。触及源码/测试 lint 和 diff check 通过。运行时 Node 22.23.3 与已有 SQLite native module 匹配；FS/SQLite 实际验证，MySQL/PostgreSQL 明确关闭。没有远程 CI、构建、真实 NovelAI、浏览器或手机真机通过声明。

## Pending and next target

用户续接后开始 S2：官方插件注册/SDK、正文/生图双模式、电脑框选/手机长按、单标注卡片与历史、角色库/作品启用清单、预设/模型路线配置。LLM 执行留给 S3，NovelAI 请求留给 S4。自定义 Package prose surface 通过已有 Host/SDK 边界接入，避免任意 DOM 改写。

## Read first and do not repeat

核对真实 Git → 本 HANDOFF → Plan index/core/plugin → Record → 相关源码。保护 main 的 AGENTS.md 与 docs 的 README/WEB-PERSISTENT-PROMPT/templates 无关 dirty changes。不要重开产品讨论、复制 AFPL 参考源码、扫描其他 Plans/Records 或读取其他 reference。参考授权仅 st-chatu8，不更新 reference 体系。

## New-chat bootstrap prompt

继续 Atria 官方生图插件任务 `atria-novelai-illustration` 的 S2。先核对 Git/worktree 和 docs:HANDOFF.md，再读 docs:plans/feat/novelai-illustration/index.md、core.md、plugin.md 与对应 Record。沿用 feat/novelai-illustration，S1 提交为 2043e052f；实现双模式选文、独立标注卡片、全局绘图角色库/作品启用清单与预设。提示词生成和生图按钮必须分开，不做批量触发；模型请求留后续阶段。只做本地最小相关验证；阶段完成提交/push、更新同一 Record/HANDOFF 后停止。保护现有无关 dirty changes。
