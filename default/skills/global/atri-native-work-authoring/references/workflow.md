# 作品设计与工具流程

## 查当前契约

Studio 工具 `atri_agent_api_catalog({query:"project"})` 返回只读目录；`atri_agent_api_read({id:"project",offset:0,limit:12000})` 使用字符偏移，按 nextOffset 继续。同样读取 `package`、`capabilities`，使用目录中的 id。

Skill 附件使用 `atri_agent_skill_files({name:"atri-native-work-authoring"})` 列举，再用 `atri_agent_read_skill({name:"atri-native-work-authoring",path:"examples/project.json",offset:1,limit:200})` 按行读取。API 参考的字符分页与 Skill 文件的行分页不同。其他调用路径以当次工具列表为准。

## 设计决策

- Text 适合正文主导；Component 在 Host surface 上补充控件；Hybrid 组合正文和定制界面；Full 需主动设计玩家的主交互与返回路径。
- Actor 是参与者，EntryPoint 是可进入的配置。资源引用精确到版本，使用稳定 ID。
- 将数据分类：World Truth、Session App、UI 草稿、Player Preference、独立 Player Continuity、独立 Realm。存储位置与谁能看到这些数据分别设计。
- Source、构建后的 Package 和游玩中的 Session 各有版本；更新作品时说明变化作用于新开局还是既有存档。
- 游戏规则在 runtime 中组织；复杂计算可使用 Package 的 JS/TS computation，接入事务、派生或处理器。Frontend v3 的 Controller 则负责界面交互，世界结果仍走正式动作与事务。

## 按作品需要组合能力

- 生成风格、提示词与模型参数：在 Project 的 `resources` 中组织 `core.prompt-module`、`core.prompt-program`、`core.generation-profile`；`package.runtime.modelPrompt` 中的角色绑定使用精确资源引用。按 `prompt-resources` 和 `package` 契约编辑，保留其他角色与资源。模型连接由 Host 配置。
- 自然语言剧情脚本、条件触发、相对等待与打断：读 `story-workflows` 和 `lifecycle`。让触发条件服务于剧情节奏，不必把每句对白都拆成工作流。
- 有独立输入与结果用途的模型任务：读 `tasks`；世界事实与人物所知的区分读 `information`。跨局延续或多人共享才需要 `continuity`、`shared`。
- 定制 UI：沿用 `atri-native-ui-authoring`，从 Frontend Source Graph 修改视图和交互；已有组件优先做 semantic patch。

## 提案到 Review

`atri_agent_get_project` / `atri_agent_list_sources` / `atri_agent_read_source` 读取现状；`atri_agent_query_resources`、`atri_agent_resource_references`、`atri_agent_resource_closure` 查资源和反向引用。参数以当前工具 schema 为准。

计划步骤用稳定 stepId。`atri_agent_project_save` 提议完整结构化 Source；资源 attach/update/fork 使用当次工具定义。普通文本文件通过 `atri_agent_source_write` 提议，携带 path、content、encoding、stepId。操作先进入提案，提交由现有 Review/Commit 完成。

`atri_agent_validate_current` 检查的是已提交 Project；检查本次提案用 `atri_agent_prepare_review`，它会建立 Workspace、试运行操作并执行验证与 Preview。进入 repair 后，读实际诊断，使用 `atri_agent_reset_operations` 清空旧操作，再提出完整修复集。若 baseRevision 已改变，说明冲突对应的修改，交由现有任务流程处理。
