# Atria 设置界面与原生主题重构

- Task ID: `refactor/atria-settings-and-themes`
- Primary Workspace: `main`
- Plan: [index](../../plans/refactor/atria-settings-and-themes/index.md)
- 实施分支: `refactor/atria-settings-and-themes`

## I1 — 契约与基线（完成）

- Start HEAD: `60aca695726893e298b7d485f300c6efef3b79fd`，获取远端后与 `origin/main` 相同，源码主线干净。
- docs 当前 HEAD 为 `050d892b8`；本任务方案已存在，其他任务 dirty 内容不纳入本任务提交。
- 独立语义分支和源码工作树已建立，产品代码不写入 docs。
- 复核：固定浅色安装器、旧主题回放字号等个人偏好、debounce 保存无逐行真实回执仍存在。
- End/Tested HEAD: `24962ec0e`（相同文件内容在提交前验证）。
- 新增版本化原生主题模型；六个只读起点、确定性角色补全、日夜解析、严格导入和保留原文的迁移计划。
- 实际验证：`theme-model.test.js`，1 suite / 5 tests 通过，包括内置对比度与必要边界。
- 历史审计检查不作为本次结果。浏览器及持久链留待实际接通后的检查。

## I2 — 原生主题与资产（完成）

- Start HEAD: `24962ec0e`。
- End/Tested HEAD: `328142167`。
- 接通现有 `/api/themes`、NamedDocRepo 和 settings 保存队列；新增只读清单及写入结果核对。内置原件与用户同名文档分离。
- 新账户默认 settings 明确种入 system 合同；历史 `firstRun` 只代表引导未完成，不据此把旧账户误判为新账户。已有账户升级保持 light。
- 迁移资产先写、标记最后写；稳定 ID 复用部分成功资产，保留完整旧偏好、CSS 和未映射字段。原文档不删除。
- 预览独立于普通偏好；系统变化、确认/取消重新解析模式；单一 CSS 投影，支持 URL `atriaNoThemeCss=1` 与 `Ctrl+Alt+Shift+R` 临时恢复。
- 主题写入失败先读取持久权威核对，资产成功而选择失败时只重试选择。保存中禁止撤回或重复提交。
- 实际验证：3 suites / 14 tests 通过（model、service、appearance）。首次组合运行发现旧全局 stub 不适用新输入，改为明确注入 authority 后补测系统变化/CSS/释放；复测通过。
- 定向 ESLint 首次发现 4 处 brace-style，已自动修复；最终交付前对新增 UI 与本次改动一起核对。

## I3 — 设置呈现与交互（完成）

- Start HEAD: `328142167`。
- End/Tested HEAD: `24d7defd2`（相关内容在提交前检查）。
- 桌面两列工作纸、手机分类子页；分类和搜索定位使用原 Navigation child，未增加全局 router。高级目标展开原控件，查询编码在现有 route 内。
- 主题图库、日夜查看、模式、顶部确认/取消、配色、CSS、导入校验、导出原文和只读内置副本均由主题 authority 驱动。
- 普通偏好即时生效并等待原保存队列回执；失败保留值并逐行重试，迟到回执和卸载保护由 revision/epoch 处理。
- Native 消费者核查：Enter 已由 `native/play-product.js` 读取；字号沿 `--fontScale` → `--mainFontSize` → Atria typography tokens；减动/模糊沿 power-user 与 Environment。Native 阅读器独立管理跟随和历史锚点，不公开旧 scroll 开关。
- 语言是原浏览器存储/重载权威；离页确认沿原 guard。旧通知、声音、保活未接通 Native 生命周期，媒体由 Work/Session 权限控制；六分类说明真实归属，不做虚构开关，旧数据保留。
- 实际针对性检查：preference-controls 2、utility-workspaces 8、settings-workspace 2 tests 通过。旧 utility 测试改为验证原生呈现与 legacy 节点保留；JSDOM 缺少 randomUUID 的问题通过注入现有 UUID authority 修复。
- 独立 Chromium：1440×1000、320×850；检查 Azure / Celestial 实际 Shell、预览与按钮颜色，320px document/settings scrollWidth 均为 320。截图仅在隔离临时测试目录，非用户资料。
- 视觉发现并修复：搜索输入缺少主题样式、墨色按钮需独立文字角色；不把即时颜色过渡截图误认成稳定颜色。
- 最终端到端保存/迁移及跨界面检查在 I4 执行。

## I4 — 跨界面核对与交付（完成）

- Start HEAD: `24d7defd2`。
- End/Tested HEAD: `5eb3bc7652cd9837ca8c555cf74976fab078932c`。检查在此提交的相同文件内容上执行；提交后仅核对 Git，不把历史检查冒充本次验收。
- 修复共享 Shell/表面中的硬编码白色、减少模糊替代底、墨色按钮与强调按钮的文字角色。内置派生颜色同时检查普通/选中/悬停/按下和状态背景上的对比度。
- 主题资产以稳定 ID 映射到 NamedDocRepo 原有 bucket 的稳定键，显示名可修改而不改变槽位引用；内置与旧用户文件均不覆写。没有新增资产库或持久层。
- 资产真实读取成功后才写选择；请求结果不明时下一次先读取核对，导入重试复用同一候选身份。资产成功而选择失败保留资产，定向重试；删除引用主题先保存有效默认配对。
- 设置页的直接编辑明确传入当前查看主题身份，修复 system 夜间下误编辑日间主题的问题。保存中的导航由既有 leave guard 阻止，纯浏览离开取消，内容草稿请求原有离开确认。

### 实际本地验证

- Jest：8 suites / 37 tests 通过；后续变更只重测 model/service/settings-workspace，3 suites / 15 tests 通过，包含新增的夜间编辑/重命名合同。累计 **38 个不同的单元/合同用例**通过，未宣称全量测试。
- 定向 ESLint：本任务生产 JS 与新增测试通过，最终无 error/warning；两份旧 E2E 修改处另做 `node --check`，未运行其整份历史场景。
- 设置相关三个源文件的原生本地化 audit 通过；default settings / 中文 locale JSON 解析通过，`git diff --check` 通过。
- 新增真实 Chromium E2E：`tests/e2e/atria-shell/11-settings-themes.e2e.js` 的 **4 个不同场景**通过。系统/主题跨表面场景在最近四项运行中通过，其余三项在修复后定向运行通过（3 passed / 49.2s），不把两个批次误写为同一轮四项全过。
- 新账户：深色系统默认 Dark Lite，显式 light 与独立夜间 Azure 配对，system 随系统切换；五款旧主题实际 Shell 底色不同，字号 1.25 切主题/刷新不变。
- 跨表面：Play 阅读器真实文本颜色与字号、Library/Studio/Runtime/Agents 的 Shell、Popup 与 Toast；独立 Chromium 另外打开 Extensions 的 Regex 兼容岛，Dark Lite 主文字 `rgb(238,233,226)`、兼容表面 `#242424`，Shell `rgb(23,23,23)`，已查看截图。
- 保存故障注入：普通偏好 503 后逐行错误/重试，保留当前值与跨分类状态；主题资产成功而选择失败时只写一次资产，重试只保存选择；CSS 单一来源、键盘恢复、取消不回滚独立字号。重命名保持身份，删除当前引用恢复默认。
- 迁移：隔离旧账户（原 Azure 同名修改、未保存颜色、字号、自定义 CSS），系统深色仍首次 light；选择写入失败后恢复，资产仍仅两份迁移副本；刷新不重复迁移，CSS 只注入一次；旧原文和未知字段完整。
- 导入：旧 CSS 默认关闭、同名另存、不自动应用、未知版本 UI/API 拒绝、原生导出结构再导入保持 colors/css/compatibility。
- 响应式与可达性：1440、900、390、320px；无 document/settings 横向溢出，顶部动作可达；搜索打开原高级控件并归还焦点，浏览器返回保留查询；内容草稿离开取消/确认及中文设置实测。

### 失败与修复证据

- 首轮响应式脚本重复点击已展开的 CSS disclosure，导致脚本将其关闭；修正测试前置状态，相关复测通过。
- 扩展重命名验收暴露真实 system 夜间编辑身份错误；改为传入实际查看身份并增加合同测试，相关三项 E2E 复测通过。
- 对比度补检发现 Serene 按下态及部分主题选中底上的文字不足 4.5:1，调整确定性派生并扩展内置测试；复测通过。
- 本地化 audit 首次将代码 placeholder 当作 UI prose；改为显式代码行构造，保留示例，复测通过。
- 测试目录与数据均隔离，未调用外部模型 API；截图/日志/故障材料为临时测试材料，交付时清理。

### 范围与证据限制

- 未运行全量 lint/test/build、APK、真实 Android 设备或完整 WCAG 认证；Android 系统栏复用现有桥接，实测证据是 Chromium。
- 启动前加载画面使用 Serene 基线，取得账户设置后、Shell 可交互前恢复有效主题；没有用跨账户浏览器缓存猜测首次主题。
- 任意旧 CSS 选择器不承诺逐像素兼容；作品自有内容不受强制改写。旧通知/保活/聊天媒体数据仍保留，未伪称接入 Native 生成。

## 交付

- `main` 已由 `60aca6957` 快进集成至 `5eb3bc7652cd9837ca8c555cf74976fab078932c`，与已验证任务提交完全相同，无冲突或新增产品差异，因此未无关重复测试。
- 实施提交：`24962ec0e`（I1）、`328142167`（I2）、`24d7defd2`（I3）、`5eb3bc765`（I4）。
- Plan 入口及主题/迁移状态已链接本 Record；源码与 docs 各自提交、同步，保留其他任务未提交内容。
- 本任务未创建 HANDOFF 或 PR；交付清理仅处理本任务源码工作树、语义分支和临时测试材料。
