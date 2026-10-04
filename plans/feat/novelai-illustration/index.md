# 官方生图插件 — Plan

- Task ID: `atria-novelai-illustration`
- Primary Workspace: `main` 产品源码，实施分支 `feat/novelai-illustration`
- Status: Approved（2026-10-04 用户多轮确认产品边界并授权开始）
- Record: [实施记录](../../../records/feat/novelai-illustration.md)

## Goal and frozen boundaries

提供随 Atria 分发、独立启停的官方生图插件。NovelAI 官方及第三方兼容接口为首批后端；以 damoshen123/st-chatu8 的功能为参考，独立实现源码，不复制其 AFPL 代码。移除智绘姬助手；不做角色参考图与 Vibe Transfer。

正文模式只展示插图；生图模式支持桌面框选、手机长按连续选文，标注可跨段落。每个标注独立操作；生成提示词与生成图片必须分开，无全局批量生成默认入口。图片置于选文结束的段落下方，默认展示用户选择的一个版本。

全局绘图角色库、作品启用清单、姓名/别名匹配和手动增删；固定描述由程序保留，LLM 补充场景与每个角色的动态描述。允许直接填提示词。风格/质量词、负面提示词及 NovelAI 参数预设支持作品默认与单标注覆盖。用户修改的提示词不被配置更新自动覆盖。

## Modules and stage routing

| Stage | Required modules | Deliverable |
| --- | --- | --- |
| S1 内核基础 | [core](core.md) | 标注锚点、版本化呈现记录、图片资产、段落插图、存档闭包 |
| S2 官方插件交互 | core + [plugin](plugin.md) | 双模式、选文、卡片、角色库与预设 |
| S3 提示词生成 | core + plugin + [generation](generation.md) | 独立模型路线、上下文快照、组合与编辑 |
| S4 NovelAI 与最终集成 | core + plugin + generation + [novelai](novelai.md) | 两类接口、独立任务、取消与历史、最终集成 |

S1 → S2 → S3 → S4。内核公开稳定服务，插件只通过这些服务操作正式数据；复用现有存储、模型路线、密钥、任务调度与 AssetStore。新增字段可选，旧数据无需迁移。

## Execution and validation

每阶段只执行本地最小相关验证，记录实际运行的证据，不运行远程 CI 或声称未执行的 UI/真机检查通过。呈现部分使用本地 `ui-ux-pro-max` Skill 指导替代文字、加载和布局稳定性；S2 交互验证需要本地浏览器工具时加载 `playwright-cli`。不要求代理并行工作。

每阶段提交/push 产品与 docs，更新同一 Record 与唯一 live HANDOFF，给出接手提示词后停止。S4 全部完成才合并 main、验证并清理分支/HANDOFF。保护原工作树与 docs 工作树的无关 dirty changes。
