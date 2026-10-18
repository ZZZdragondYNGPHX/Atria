# 设置与主题：源码审计及调研依据

## 1. 职责与证据边界

- Task ID：`refactor/atria-settings-and-themes`；本文件保存审计与研究输入。
- 先读 [index.md](index.md)；产品决定归 [settings-ui.md](settings-ui.md)、[themes.md](themes.md)、[migration.md](migration.md)。
- 执行与记录方式归 [Governance](../../../README.md)。
- 审计起点的源码 HEAD：`2686aa40`，与当时 `main` 相同；初始工作树干净。
- 审计期间其他任务并行修改了 Dock 相关工作树，浏览器运行时已可见这些变更。
- 编写方案时产品基线：`main@60aca6957`；Dock 已集成，不在本任务重新设计。
- 这不代表所有前端代码均未变化，也不代表旧测试在 `60aca6957` 全部重跑。
- 下文源码路径均为产品 `main` 分支的仓库相对路径；文档链接为 `docs` 分支。
- 本轮交付是方案与新对话实施入口，没有修改产品或创建新的高保真 HTML。
- 已确定文字构图与 Serene Canvas 方向；不能将其写成新视觉稿已被接受。

## 2. 主题失效的代码根因

1. `public/scripts/atria-shell/appearance.js` 的 `installAtriaAppearance` 安装器直接选择 `LIGHT`。
   同文件仍保留颜色解析与 `resolveAtriaAppearance`，但默认 Shell 不用它决定实际明暗。
2. `public/css/atria-tokens.css` 给 `--atri-*` 提供 Serene 单浅色值。
   `:root[data-atria-appearance]` 同时固定 `color-scheme: light`。
3. Shell 挂载时，该文件将 Atria 颜色反向映射到 `body` 的 SmartTheme 变量。
   原生界面消费 Atria tokens，旧控件、Popup、Toast 则经过这个兼容桥。
4. `public/scripts/power-user.js:1846` 的旧 `applyTheme` 仍写旧颜色和偏好。
   选择器能改变主题名与存储值，不代表新 Shell 的计算颜色随之改变。
5. 当前只保留 `public/scripts/atria-shell/utility-workspaces.js:9` 的 token CSS 示例。
   一个高级 CSS 示例不能承担完整的主题选择、映射、日夜与资产管理。
6. `public/css/atria-utilities.css:107` 等局部规则仍有硬编码白色。

结论：问题同时涉及 appearance 选择、token 投影和旧主题模型的职责，不能只重画下拉框。
上一轮 Serene 仅设计浅色是历史范围；本任务的浅色、深色、跟随系统由当前方案定义。

## 3. 现有主题资产与偏好表面

### 3.1 五个随产品发布的主题

| 名称 | 文件 | 本轮读取到的背景色倾向 |
| --- | --- | --- |
| Azure | `Azure.json` | 蓝灰 |
| Cappuccino | `Cappuccino.json` | 暖灰棕 |
| Celestial Macaron | `Celestial Macaron.json` | 深蓝 |
| Dark Lite | `Dark Lite.json` | 中性深灰 |
| Dark V 1.0 | `Dark V 1.0.json` | 冷深灰 |

这些是旧配方，不是新 token schema 已完成的五个主题。
五份文件均有 `font_scale: 1`；主题选择会经过能回放字号等非颜色字段的旧逻辑。
新主题如何保留名字与配色、隔离普通偏好，见 [themes.md](themes.md) 与 [migration.md](migration.md)。

### 3.2 当前设置不是完整原生设置中心

- `public/scripts/atria-shell/utility-workspaces.js:219` 仍搬运 3 个旧 DOM 分组：
  `UI-presets-block`、`color-picker-block`、`customCSS`。
- 搬运保存原位置、样式、可见性与 ARIA，卸载时还原；旧 handlers 和持久层仍在工作。
- `public/index.html` 中旧 `#user-settings-block` 审计计数为 134 个表单/操作 DOM 控件。
  该数包含按钮、联动项和实现节点，不能解释为 134 个独立用户设置。
- 未显示在新设置页不等于没有消费者；存在 handler 也不等于 Native 主路径生效。
- 普通偏好经 `updateAtriaPreference` 等既有接口写入，不能另建平行 settings store。
- `public/scripts/power-user.js:1116` 起的 adapter 与 `applyFontScale` 需要保持既有输入语义。
- 当前原生字号滑条的 `input` 只更新样例，`change` 才应用；不借主题修复改变此行为。

## 4. 消费者、共享能力与兼容边界

| 范围 | 已核实事实 | 实施时的判断边界 |
| --- | --- | --- |
| Shell | Registry、Navigation、WorkspaceHost 已统一路由 | 设置分类复用现有工作区，不增加全局 router |
| 普通偏好 | 原生控件连接现有设置 authority | 保存状态需要对应真实回执，不能把同步返回当持久成功 |
| Immersive | `public/scripts/immersive/` 仍有旧 `#chat` 消费者 | 有效消费者不一定属于默认 Native Play |
| 媒体 | `chats.js` 的旧外部媒体处理与 `script.js` 的消息懒加载消费旧 chat 数据 | 与 Native Work/Session 的媒体权限逐项比较，不能混同 |
| 通知声音 | 有浏览器/Android 通知及声音函数、开关 ||
| 账户与备份 | 已有独立 Utility 和服务权威 | 设置只提供相关入口，不嵌入第二套身份/恢复业务 |
| 插件 | 内置 Regex/Search Tools 保留有限旧面板适配 | 保留挂载/卸载、handler、scope 与错误恢复 |
| Native 扩展 | `native/extensions-workspace.js` 已有原生管理与草稿保护 | 不把所有插件笼统归为旧注入 DOM |
| 作品 UI | full/component Work 可拥有自己的视觉 | 应用主题覆盖边界不能侵入作品内容或权限 |

可复用入口：`atria-shell/components.js` 的按钮、列表、Section、Disclosure、Notice；
`primitives.js` 的 Loading/Error/Empty；`environment.js` 的三档、键盘与减动状态；
`popup.js` 的既有 modal/viewport 生命周期；`back-resolver.js` 的统一返回优先级。
上述事实为迁移盘点依据；设置归属只在 [settings-ui.md](settings-ui.md) 维护，资产迁移规则归 [migration.md](migration.md)。

## 6. 官方网络研究（2026-10-15）

仅以第一手文档或产品官方源码支撑事实；“对 Atria”是本任务推断，不是来源原话。
外部页面可能更新；下面保存本轮相关结论，不把别的产品约束移植成仓库规则。

1. [SillyTavern UI Customization](https://docs.sillytavern.app/usage/core-concepts/uicustomization/)
   事实：旧主题、颜色、自定义 CSS 与多种 UI 偏好集中在同一外观体系。
   对 Atria：解释旧字段为何混合；保留资产可读性，不照搬旧布局与全部调节器。

2. [Carbon Themes](https://www.carbondesignsystem.com/building-blocks/foundations/themes/overview)
   事实：跨主题保持 token 与角色不变，只改变值；共享组件消费同一语义。
   对 Atria：沿 `--atri-*` 建完整配色覆盖，避免每个主题各写一套 selector。

3. [Windows app settings](https://learn.microsoft.com/en-us/windows/apps/design/app-settings/guidelines-for-app-settings)
   事实：建议分组、限制内容宽度、按需展开子选项，普通偏好及时反映变化。
   对 Atria：采用工作纸与分组行；不照搬 WinUI 控件，也不按建议数量删除现有能力。

4. [Linear Preferences](https://linear.app/docs/account-preferences)
   事实：提供预设/自定义主题、浅深色与跟随系统，以及独立字号和交互偏好。
   对 Atria：主题与普通偏好职责分开；不复制 Linear 的产品导航或协作范围模型。

5. [VS Code settings](https://code.visualstudio.com/docs/configure/settings)
   事实：分组与搜索并存，支持已修改筛选、逐项重置、设置直达链接和显式范围。
   对 Atria：搜索定位原控件并解释归属；不新增不存在的用户/作品/会话覆盖层。

6. [VS Code themes](https://code.visualstudio.com/docs/configure/themes)
   事实：上下键可以预览主题，Enter 确认；可继续浏览更多主题。
   对 Atria：浏览候选与使用确认分开；本轮不据此建设主题市场。

7. [Obsidian Settings](https://obsidian.md/help/settings)
   事实：明暗模式、强调色、主题管理及界面/正文/等宽字体分别组织。
   对 Atria：明确主题与阅读偏好边界，避免再次用主题包回放字号。

8. [Obsidian Themes](https://obsidian.md/help/themes)
   事实：主题有安装并使用、停止使用恢复默认、更新及卸载路径。
   对 Atria：区分当前主题、只读内置与自定义副本；不引入本轮未要求的更新市场。

9. [Obsidian CSS snippets](https://obsidian.md/help/snippets)
   事实：CSS 片段独立列出、刷新并用开关启停。
   对 Atria：高级 CSS 应有独立启停与恢复入口；不要求浏览器用户操作系统目录。

10. [Obsidian styling](https://docs.obsidian.md/Reference/CSS%20variables/About%20styling)
    事实：插件消费官方 CSS variables 可继承主题，覆盖变量减少复杂 selector。
    对 Atria：继续统一原生与兼容桥的语义；不保证任意第三方 CSS 自动兼容。

11. [Zed Themes](https://zed.dev/docs/themes)
    事实：主题列表实时预览，确认后保存所选主题。
    对 Atria：一条预览/使用/取消路径足够，不安排两个必须进入的预览页面。

12. [Zed ThemeSelector source](https://github.com/zed-industries/zed/blob/main/crates/theme_selector/src/theme_selector.rs)
    事实：候选先覆盖内存，确认写设置文件，未确认关闭时恢复原主题设置。
    对 Atria：取消恢复身份与模式语义，再按当前系统解析；不能回放整份偏好快照。

13. [Firefox theme management](https://support.mozilla.org/en-US/kb/use-themes-change-look-of-firefox)
    事实：区分启用、停用恢复系统主题和移除用户安装主题。
    对 Atria：恢复默认与删除自定义资产是不同操作，内置资产不应直接改写。

14. 不虚称已获完整合规认证。

15. [MDN color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/color-scheme)
    事实：该属性告诉浏览器可用的色彩方案，影响原生控件、滚动条等 UA 表面。
    对 Atria：主题、`color-scheme` 与浏览器 chrome 同步，避免正文深色而控件仍浅色。

## 7. 研究如何使用

产品选择与导入/升级语义以本 Bundle 对应模块为准，来源只提供理由和可借鉴机制。
布局沿 Serene 工作纸与现有组件；不能把截图、示例或外部框架当作迁移技术栈的授权。实质偏离再更新设计依据。
