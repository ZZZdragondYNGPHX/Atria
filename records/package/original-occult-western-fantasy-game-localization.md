# 异闻之城中文发行与 Atria 首次语言设置修复

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

- Task ID: package/occult-city-localization
- Primary Workspace: package / original-occult-western-fantasy-game
- 日期：2026-10-04
- 起点：Package `dbb3f30b2b6ec052039a6788409d4a99266ac925`；Core `d0cb08b36dd6e925e50131dcf243d3c761c768e4`。
- 实现：Package `a13bce997`；Core `084089d41`（fix/first-run-language，随后快进 main）。

## 目标与结果

游戏全面汉化、中文自然，并修复 Atria 首次进入的默认语言及选择后不生效的问题。游戏名为“异闻之城”。

3.0.1 的游戏列表、入口和页眉分别采用“异闻之城”“异闻之城：从凡人开始”“异闻之城”。角色创建、确定性开篇、机构/人物名称、公开状态、能力规则与锚点/代价、风险及处置反馈、随身记事、存读档和六条城市常识均已汉化；叙述及当地际遇提示明确要求自然简体中文，避免系统口吻和内部标识泄漏。规则标识、输入枚举、世界经济和行动权限保持兼容。

新版本有独立 PackageVersion `pkgv_5006e5160cce49ca333e07efbde34189`。旧 1.0.0、2.0.0、3.0.0 文件及摘要均保持不变。新版本故事不自动迁移旧版本存档。

Atria 首次无语言偏好时固定使用英文，保留已选的中英文偏好。克隆的首次设置下拉框明确同步当前语言，选择事件使用独立绑定，并串行处理语言加载；确认等待所选语言生效及账户保存。中英文切换同时更新 document.lang、翻译表和设置下拉框；回到英文时恢复原始文字/属性。确认后先保存教程进度和 firstRun，再按需刷新，确保动态 Shell 与所选语言一致。相对时间默认语言也统一为英文。

## 修复中发现的兼容问题

原 Package 构建以资源路径生成资产 ID。中文资源内容变化后沿用同一资产 ID，会使安装过 3.0.0 的用户遭遇 native_immutable_conflict。当前 Open Lives 构建改为根据资源路径与内容摘要共同生成资产 ID；历史构建配置不变。

## 最终集成

产品 main 已快进到 `084089d41`，保留本地 AGENTS.md 修改。Package 为 `a13bce997`；任务分支在发布 main/docs 后删除。
