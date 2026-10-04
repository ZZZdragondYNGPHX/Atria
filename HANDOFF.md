# Live HANDOFF

## Task

- Task ID: `atria-novelai-illustration`
- Primary Workspace: main 产品源码
- Current branch: `feat/novelai-illustration`（独立产品 worktree）
- Current HEAD: `27c387300`，已推送 origin
- Current stage: S2 Complete，S3 尚未开始
- Plan entrypoint: `plans/feat/novelai-illustration/index.md`
- Next-stage required modules: `core.md`、`plugin.md`、`generation.md`
- Record: `records/feat/novelai-illustration.md`

## Completed

S1 内核基础及 S2 官方插件交互完成。官方 `atri_official_illustration` 默认关闭，从 Extensions → Plugins → 官方插件启用；沿现有 Native 扩展运行时和 SDK 接入正文/生图模式、准确跨段选文、单标注卡片、角色库/作品清单、预设和独立连接/模型路线配置。卡片可直接编辑保存提示词，两个生成按钮分开且暂不可用。已有插图由 Host 渲染，停用后保留。

单标注草稿进入原有版本化呈现记录，随存档/导入/恢复闭包保存；角色与预设在创建时冻结，配置更新不覆盖已编辑提示词。全局配置沿 Native 资源存储及 CAS。Host/Package prose surface、Shadow DOM selection 和高亮通过 Host 边界接入，不任意改写 Package DOM，不修改正文或剧情 authority。队列、分支捕获及冲突身份校验保护迟到请求。

产品提交 `27c387300`；本阶段按治理停止，不进入 S3，不合并 main。

## Validation

10 套本地相关 Jest 分次执行，覆盖合计 113 项通过；仅在改动或失败涉及的套件重跑。FS/SQLite 实际验证，Node 22.23.3 与现有 native module 匹配。26 个触及 JS 文件 lint 和 diff check 通过。

本地 Chrome/真实 FS+HTTP fixture：桌面真实鼠标跨段框选、卡片保存、高亮和正文节点保持通过；375×812 手机模拟视口中通过 Range 设置选区后执行真实触摸建标注/卡片/历史/角色配置，布局无横向溢出和工具条重叠。停用插件保留 Host 插图；Shadow DOM composed selection 与生产 Frontend prose binding 验证通过。

手机模拟器触摸长按未产生原生选区，不能声称系统菜单或选区拖柄通过；没有手机真机、虚拟键盘、实际 WebView、真实模型/NovelAI、构建或远程 CI 通过声明。

## Pending and next target

用户续接后开始 S3：独立提示词模型路线执行、准确源文 revision 的历史上下文快照、固定外观与 LLM 场景/逐角色动态描述组合、直接编辑与修改保护。按正式 generation 模块实施。图片请求、独立图片任务/取消和 NovelAI 双接口留 S4。

S2 的“保存卡片”完成正式持久化；未保存编辑只在当前实例中保留。真机长按、连续拖柄和虚拟键盘仍需要后续实际设备证据。自定义 Package 必须经 messageId + canonical prose 的 Host/SDK 边界接入，不任意 DOM 改写。

## Read first and do not repeat

核对真实 Git → 本 HANDOFF → Plan index/core/plugin/generation → Record → 相关源码。保护 main 的 AGENTS.md 与 docs 的 README/WEB-PERSISTENT-PROMPT/templates 无关 dirty changes。不要重开产品讨论、扫描其他 Plans/Records 或读取其他 reference。参考授权仅 st-chatu8，不更新 reference 体系；当前 S2 未读取 reference。

## New-chat bootstrap prompt

继续 Atria 官方生图插件任务 `atria-novelai-illustration` 的 S3。先核对 Git/worktree 和 docs:HANDOFF.md，再读 docs:plans/feat/novelai-illustration/index.md、core.md、plugin.md、generation.md 与对应 Record。沿用 feat/novelai-illustration，S2 提交为 27c387300；接入独立提示词模型路线、准确源文历史上下文快照、固定/动态描述组合与编辑保护。提示词与图片生成保持两个独立步骤，无全局批量入口；NovelAI 请求留 S4。只做本地最小相关验证；阶段完成提交/push、更新同一 Record/HANDOFF 后停止。保护现有无关 dirty changes；手机长按/拖柄仍无真机验证。
