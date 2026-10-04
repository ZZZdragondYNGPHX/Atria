# Live HANDOFF

## Task

- Task ID: `atria-novelai-illustration`
- Primary Workspace: main 产品源码
- Current branch: `feat/novelai-illustration`（独立产品 worktree）
- Current HEAD: `e39b10f9d`，已推送 origin
- Current stage: S3 Complete，S4 尚未开始
- Plan entrypoint: `plans/feat/novelai-illustration/index.md`
- Next-stage required modules: `core.md`、`plugin.md`、`generation.md`、`novelai.md`
- Record: `records/feat/novelai-illustration.md`

## Completed

S1 内核、S2 官方插件交互、S3 独立提示词生成完成。官方 `atri_official_illustration` 默认关闭，从 Extensions → Plugins → 官方插件启用；正文/生图模式、准确选文与单标注卡片、角色库/作品清单、预设和独立连接/模型路线沿现有 Native 服务、SDK 与持久化接入。Host 保留停用后的插图，正文与剧情 authority 不变。

新增正式 `role.illustration_prompt` 用途，Runtime 可创建对应路线，插图配置选择作品/全局路线。单卡片生成提示词与生成图片分开；提示词按钮已可用，图片按钮留 S4。创建标注不请求模型，生成提示词不调用 NovelAI。固定外观/风格/质量由程序组合，模型只补充共用场景与逐角色动态描述/剧情服装；支持直接填写、分块组合、最终输入预览、历史版本及显式配置应用。

新标注在服务器冻结准确选中回复正文边界的历史上下文，避免后续剧情；保存之前两个完整轮次、相邻段落及既有路径选出的相关资料，遵循 Information/Perspective 权限。Provider 按真实容量计数，辅助目标约 4000 tokens，先裁剪背景，主体不静默截断。请求证据、模板、模型路线和角色/预设随独立提示词版本进入原有呈现存档闭包，resume 导入后仍可生成。

提示词任务使用 NativeTaskScheduler 与 NativeGenerationHost，HTTP 202 后由服务器持有；同标注去重、显式取消、原分支归属与晚到保护已接入。继续剧情、切换会话/分支、关闭浏览器或卸载 UI 不自动取消任务。期间修改的正式及未保存编辑保留，新版本可显式应用；不消耗剧情 resolver/narrator 预算。公开铁人历史/回滚权限保持原规则。

产品提交 `e39b10f9d`；本阶段按治理停止，不进入 S4，不合并 main。

## Validation

S3 分次运行 8 套本地相关 Jest，合计 85 项实际通过；run-policy 使用相关筛选，37 项明确未执行。发生变化后仅重跑相关套件。FS/SQLite 实际执行；本地 Node 22.23.3 与现有 native module 匹配，MySQL/PostgreSQL 明确关闭。21 个触及 JS 文件 lint 与产品 diff check 通过。

本地 Provider fake + 认证 HTTP 验证请求范围、202 后执行、同标注去重、排队模型冻结、容量裁剪、继续剧情/切换分支、编辑保护、取消/删除晚到、错误输出/仅本步骤重试、提示词/图片分离；存档与 resume 的干净导入/再次生成及剧情预算隔离通过。DOM 验证卡片状态、显式历史/配置应用、分块组合、未保存编辑保护及 UI 订阅清理。

S3 未运行浏览器、外部 LLM/NovelAI、构建、远程 CI 或真机。S2 的本地 Chrome 桌面框选/手机 Range 选区与触摸按钮证据仍有效；触摸长按未产生原生选区，系统菜单、拖柄、虚拟键盘、真实 WebView 和手机真机仍无通过声明。

## Pending and next target

用户续接后开始 S4：NovelAI 官方及第三方兼容两类接口、独立图片任务/取消、实际提示词/参数快照、图片历史与最终集成，按正式 novelai 模块实施。

服务器内存任务仅承诺服务器存活期间执行，不承诺服务器重启续跑。旧 S2 head-only resume 若没有冻结上下文且已丢失原文历史，不能以当前场景替代准确历史；该类旧标注可直接填写提示词。新 S3 上下文与生成版本进入存档闭包。

## Read first and do not repeat

核对真实 Git → 本 HANDOFF → Plan index/core/plugin/generation/novelai → Record → 相关源码。保护 main 的 AGENTS.md 与 docs 的 README/WEB-PERSISTENT-PROMPT/templates 无关 dirty changes。不要重开产品讨论、扫描其他 Plans/Records 或读取其他 reference。参考授权仅 st-chatu8，不更新 reference 体系；S2/S3 未读取 reference。

S3 已接入正式模型路线、历史上下文与任务，无需重复实现；S4 复用这些边界。自定义 Package 仍需经 messageId + canonical prose 的 Host/SDK 边界接入，不任意 DOM 改写。S4 全部完成后才最终合并 main、验证、删除任务分支与 HANDOFF。

## New-chat bootstrap prompt

继续 Atria 官方生图插件任务 `atria-novelai-illustration` 的 S4。先核对 Git/worktree 和 docs:HANDOFF.md，再读 docs:plans/feat/novelai-illustration/index.md、core.md、plugin.md、generation.md、novelai.md 与对应 Record。沿用 feat/novelai-illustration，S3 提交为 e39b10f9d；提示词模型、准确源文上下文、版本/编辑保护及服务器任务已完成。接入 NovelAI 官方/第三方兼容接口、独立图片任务/取消、图片历史及最终集成，提示词与图片保持两个独立步骤，无全局批量入口。只做本地最小相关验证；S4 完整结束后才合并并验证 main、清理分支/HANDOFF。保护无关 dirty changes；手机长按/拖柄仍无真机验证。
