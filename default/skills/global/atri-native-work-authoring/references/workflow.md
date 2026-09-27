# 作品设计与工具流程

## 查当前契约

Studio 工具 `atri_agent_api_catalog({query:"project"})` 返回只读目录；`atri_agent_api_read({id:"project",offset:0,limit:12000})` 使用字符偏移，按 nextOffset 继续。同样读取 `package`、`capabilities`，不要把文件路径当 catalog id。

Skill 附件使用 `atri_agent_skill_files({name:"atri-native-work-authoring"})` 列举，再用 `atri_agent_read_skill({name:"atri-native-work-authoring",path:"examples/project.json",offset:1,limit:200})` 按行读取。API 参考的字符分页与 Skill 文件的行分页不同。Agents 等环境只使用当次实际提供的工具；缺少 catalog 工具时给出待核验契约 ID 和移交计划，不捏造调用结果。

## 设计决策

- Text 适合正文主导；Component 在 Host surface 上补充控件；Hybrid 组合正文和定制界面；Full 需主动设计玩家的主交互与返回路径。模式不授予任意 HTML/JS 执行权。
- Actor 是参与者，EntryPoint 是可进入的配置。资源引用精确到版本，不使用 latest，也不凭显示名推断稳定 ID。
- 将数据分类：World Truth、Session App、UI 草稿、Player Preference、独立 Player Continuity、独立 Realm。存储域不自动决定 UI、Actor 或 Task 可见性。
- 在变更提案里说明哪些既有 Session 继续固定旧 Package/Schema；不要宣称 Source 更新会自动迁移所有存档。
- Package runtime 为声明式、精确闭包。用户安装的浏览器扩展是另一种信任边界，不能把插件 SDK、DOM、网络或 localStorage 当作 Package UI API。

## 提案到 Review

`atri_agent_get_project` / `atri_agent_list_sources` / `atri_agent_read_source` 读取现状；`atri_agent_query_resources`、`atri_agent_resource_references`、`atri_agent_resource_closure` 查资源和反向引用。先查当前工具 schema，再传其要求的参数。

计划步骤用稳定 stepId。`atri_agent_project_save` 提议完整结构化 Source；资源 attach/update/fork 使用当次工具定义。普通文本文件通过 `atri_agent_source_write` 提议，携带 path、content、encoding、stepId。不要直接覆盖 live Project 文件或自创第二份数据库。

`atri_agent_prepare_review` 在固定 baseRevision 的 Workspace 上 dry-run、validate、preview、simulation，并停在 Review。repair 状态下读取诊断，按现有有限轮数 reset_operations 后重新提出完整修复集。revision 冲突不静默 rebase；保留提案并说明变化。输出实际 validation/preview 证据和未验证项，不把 Review 描述为已 Commit。
