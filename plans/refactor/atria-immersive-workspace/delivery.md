# Staged delivery and editor preservation

## Responsibility

本模块负责阶段依赖、交付边界与完整编辑能力保留。

## Stage plan

| Stage | 范围与产物 | 完成门 |
| --- | --- | --- |
| D0 | 整理确认、源码基线、S00–S20 矩阵与 Draft Bundle | 文件/路由完整，原型证据与产品状态区分；本阶段不改产品 |
| D1 | 审阅草案、冻结范围；| 提议项有明确处置，schema/API/迁移与兼容测试计划可实施；|
| A1 | 现有 tokens/Environment 上的浮动外壳、导航、共享反馈/审阅骨架、搜索、认证/学习、设置/全局诊断 | V00/V01/V18/V19；Back/Esc/深链及草稿离开路径成立 |
| A2 | 阅读/输入/历史、作品与资源导航、完整安装/导入恢复页、共享和自有 UI 宿主入口 | V02–V08/V17；完整旧控制器保留，真实流式/停止/确切依赖闭环 |
| A3 | Studio 完整挂载和引用页签；Runtime、Agents、Extensions / 插图的布局与接线 | V09–V16；全编辑表面可达，人工/AI authority 分开 |
| A4a | Native Persona 资源/资产、会话/消息/请求快照、Prompt evidence、branch/save/shared 契约 | 服务与合约测试通过；入口仍未开放 |
| A4b | 管理/选择/搜索、新会话默认、迁移、备份恢复、Host 入口 | V20 完整开放门；A4a 支撑的真实能力全部连到 UI |
| A5 | 首阶段跨域、呈现模式、语言/键盘/设备与数据回归 | S00–S20 每项有实际证据，无编辑能力缺失；冻结首轮结果 |
| B1 | Actors/EntryPoints/Worlds/Knowledge 编辑器逐类改造 | 每类先做字段/动作/状态/authority 映射，再替换；差异/Source 和原测试保留|
| B2 | Prompt/Runtime/检索编辑器逐类改造 | 4 类提示词、所有用途/备用策略与检索完整契约 |
| B3 | Agents/Memory 编辑器逐类改造 | 全模式与 Memory OS/Trace、权限/预算/证据完整 |
| B4 | UI/Assets/Skills/Plugins/官方插图编辑器逐类改造 | 完整源码/manifest、资产闭包、参数/历史版本与取消 |

D1 冻结采用 B1–B4 顺序；A1–A3 的布局改造不是重造控制器；若新增工作量属于实际能力缺失，在该阶段 Record/Plan 精确记录。

## Complete editor preservation gate for A3

20 个 `STUDIO_VIEWS` 必须仍可访问，业务 view ID 保持：

| 组 | view IDs | 首轮保留的实际能力 |
| --- | --- | --- |
| 项目/体验 | `overview`, `experience`, `metadata` | 项目/体验契约、入口与 package metadata 全字段 |
| 提示词/运行 | `prompt-authoring`, `runtime-design` | 程序、模块、Generation、Regex、路线和确切引用 |
| 内容/角色 | `actors`, `entrypoints`, `worlds`, `knowledge` | 完整结构字段、知识条目/条件/关系/插入/预算、源 JSON |
| 逻辑/呈现/资产 | `logic`, `ui`, `assets` ||
| 记忆/智能体/扩展 | `memory`, `agents`, `skills`, `plugins` | 模式/权限/预算、记忆配置、技能声明、插件作用域/文件树 |
| 执行/构建/源 | `simulation`, `preview`, `build`, `source` | fixture 加载/暂存/模拟、预览、preflight/.atria 构建、完整高级 JSON/Source |

同时保留项目新建/打开/删除、revision 变化/Reload Latest、活动输出/诊断定位、差异审阅、Apply Cancel，以及 AI Task 的历史/路线/执行事件/提案/Commit/冲突/修复/Takeover。

高级 JSON/Source 可进入次级位置，但不是隐藏到无法到达；相同资源的结构化编辑、源码、资料库引用页签共用同一草稿与原写入 authority。不能把原型中四类代表表单当成 20 类完整实现。

Runtime、Library、Agents、Extensions 的旧字段与动作同样按 [baseline](baseline-inventory.md) 原所属小节逐项保留。只读、归档、引用约束、编译预览、插件更新后重新启用等不因新布局而变更。

A3 checkpoint 已完成上述原编辑器保留与接线；真实 20 view 可达、exact 引用 lifecycle、人工/Agent authority、Runtime 返回原启动与 Session 隔离的本地证据见 [Record A3](../../../records/refactor/atria-immersive-workspace.md#stage-a3--authoring-runtime-agents-and-extensions)。下一阶段 A4a，Persona 入口保持关闭。

## Editor replacement gate for B stages

然后替换展示组件，复用既有实体与控制器。

旧资源/会话在新编辑器中读取与保存，往返不丢未知/高级字段；若原契约不允许保留某字段，显示拒绝或显式修复，不能静默删除。

## Stage boundary and persistence

最终 F 完成整体集成与清理。

Primary Workspace 是 `main`；本任务不得在 package 分支实现产品或将 main merge 到 package。实现使用适当隔离分支并保护无关变更；Plan 不固定某台机器路径或客户端方式。

首轮 A5 与最终 F 不是同一完成状态：A5 证明新外壳/接线及 Persona 开放门，B/F 才证明全编辑器改造和整个任务完成。
