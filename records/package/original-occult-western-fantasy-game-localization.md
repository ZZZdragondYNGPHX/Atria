# 异闻之城中文发行与 Atria 首次语言设置修复

- Task ID: package/occult-city-localization
- Primary Workspace: package / original-occult-western-fantasy-game
- 日期：2026-10-04
- 状态：实现与本地验证完成，发行版 3.0.1。
- 起点：Package `dbb3f30b2b6ec052039a6788409d4a99266ac925`；Core `d0cb08b36dd6e925e50131dcf243d3c761c768e4`。
- 实现：Package `a13bce997`；Core `084089d41`（fix/first-run-language，随后快进 main）。

## 用户要求与结果

用户要求当前游戏全面汉化、中文自然，并修复 Atria 首次进入的默认语言及选择后不生效的问题。用户随后明确选定游戏名“异闻之城”。

3.0.1 的游戏列表、入口和页眉分别采用“异闻之城”“异闻之城：从凡人开始”“异闻之城”。角色创建、确定性开篇、机构/人物名称、公开状态、能力规则与锚点/代价、风险及处置反馈、随身记事、存读档和六条城市常识均已汉化；叙述及当地际遇提示明确要求自然简体中文，避免系统口吻和内部标识泄漏。规则标识、输入枚举、世界经济和行动权限保持兼容。

新版本有独立 PackageVersion `pkgv_5006e5160cce49ca333e07efbde34189`。成品 `releases/3.0.1.atria`，156341 字节，SHA-256 `31b5e467e1e6109e1c9a10a053c41c5bdd96286b973c8c3db436b855fe7cd86b`。旧 1.0.0、2.0.0、3.0.0 文件及摘要均保持不变。新版本故事不自动迁移旧版本存档。

Atria 首次无语言偏好时固定使用英文，保留已选的中英文偏好。克隆的首次设置下拉框明确同步当前语言，选择事件使用独立绑定，并串行处理语言加载；确认等待所选语言生效及账户保存。中英文切换同时更新 document.lang、翻译表和设置下拉框；回到英文时恢复原始文字/属性。确认后先保存教程进度和 firstRun，再按需刷新，确保动态 Shell 与所选语言一致。相对时间默认语言也统一为英文。

## 修复中发现的兼容问题

原 Package 构建以资源路径生成资产 ID。中文资源内容变化后沿用同一资产 ID，会使安装过 3.0.0 的用户遭遇 native_immutable_conflict。当前 Open Lives 构建改为根据资源路径与内容摘要共同生成资产 ID；历史构建配置不变。发行验证新增旧版与新版共存安装、旧版重新打开的检查。

## 本地最小相关验证

- `node tools/content-check.mjs`：41 个资源、240 项内容，中文公开知识与 manifest 精确对应。
- `node tools/package.mjs validate --core <isolated-core> --archive releases/3.0.1.atria --roleplay-only`：当前规则的普通/铁人、机构与个人超凡、动态际遇、生成边界及保存恢复检查通过，177 次本地合成请求；此运行在最终仅改变资产 ID 的构建之前完成。
- `--roleplay-ui-only`：实际 Native/QuickJS Chromium 检查通过，包含角色创建、草稿、资料抽屉、历史阅读、存读档、普通/铁人终局与不同视口，浏览器错误为零。截图保存在本地 build/ui-3.0.1-p4/，不额外提交生成证据。
- 最终成品 `--release-only`：精确 payload、中文标题/入口/开篇/反馈/机构/常识、权限、旧新版共存、旧版保持原样、实际 FS 安装/读取/Ready/开始及损坏拒绝通过。
- Core `14-native-controls.e2e.js --grep 'Chinese browser|fresh identity' --workers=1`：两项实际浏览器回归通过。覆盖中文浏览器首次英文、选择中文后立即确认、Shell 中文、重载保留、来回切换英文和教程恢复。
- Core 仅修改文件的 ESLint、JavaScript 语法检查及两工作空间 git diff --check 通过。

未运行完整产品测试、MCP 全套、付费/生产模型、Android 或真机；中文生成风格以提示与合成模型验证为依据，不宣称实测生产模型质量。保护 Core 的 AGENTS.md 及 docs 现有治理文件 dirty changes。

## 最终集成

产品 main 已快进到 `084089d41`，保留本地 AGENTS.md 修改。main 上的触及脚本语法检查、最终 3.0.1 成品 release-only（含新旧版共存与精确 payload）均通过。Package 为 `a13bce997`；任务分支在发布 main/docs 后删除。
