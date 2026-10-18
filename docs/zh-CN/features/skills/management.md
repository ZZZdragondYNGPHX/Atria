# Skill 管理

在 **Extensions → Skills** 安装、编辑、移动和删除 Skill。

::: tip 在哪里找
在 **Extensions → Skills** 安装、编辑、移动和删除 Skill。
:::

## 子面板概览

Skill 管理顶部有三个 tab：

- **已安装** —— 你 `data/<user>/skills/<scope>/` 下有什么。按作用域过滤（全局 / 预设 / 角色卡）或选**全部**。
- **浏览出厂** —— `default/skills/global/` 自带的 Skill，每行显示你本地副本是匹配、有差异，还是没装。
- **导入** —— 从文件、URL，或角色卡 / 预设里抽出 Skill 的入口。

![Skill 管理子面板，已安装 tab](/screenshots/skills/manager-installed-tab.png)

## Tab 1 —— 已安装

每行显示：

- `name` —— Skill frontmatter 里的 `name`。点击打开内嵌编辑器。
- `description` —— frontmatter 里的一行摘要。
- `scope` —— 作用域 chip（`global` / `project/<id>` / `package/<id>/<version>` / `preset/<name>` / `character/<file>`）。
- `size` —— 文件数 + 总字节数。

行内动作（右侧）：

| 动作 | 作用 |
|---|---|
| **查看** | `SKILL.md` 的只读 Markdown 渲染。 |
| **编辑** | 打开内嵌编辑器（见下文 [内嵌编辑器](#内嵌编辑器)）。 |
| **迁移到……** | 原子级跨作用域 move。|
| **改名** | 在当前作用域内原子改名。目录与 frontmatter `name` 同步更新。更新仍使用旧名称的消费者。 |
| **删除** | 删除 Skill 目录；|

### 批量选择

顶栏切到**多选**模式后，每行多一个复选框。勾选至少一项后，工具栏会多一个**把所选打包进预设……**动作 —— 见下文 [嵌入导出](#嵌入导出-到预设和角色卡)。

## Tab 2 —— 浏览出厂

「浏览出厂」tab 把你本地每个出厂 Skill 的副本和 `default/skills/global/` 里的版本对比。每行显示三种状态之一：

| 标记 | 含义 |
|---|---|
| **已安装（一致）** | 本地副本与出厂版本逐字节一致。 |
| **未安装** | 本地没有副本。点击**安装**把它落到 `global`。 |

![浏览出厂，混合状态](/screenshots/skills/manager-bundled-tab.png)

tab 顶部的**全量导入出厂**按钮，是对每个「未安装」或「有差异」行点**安装**的便捷等价 —— 它会用出厂版本**覆盖**所选内置 Skill。

::: warning 覆盖是破坏性的
全量导入出厂不会合并 —— 它直接覆盖。如果你本地改过 `event-summary-rules-zh`，导入出厂版本会冲掉你的修改。按钮标签会在点击前明确告诉你即将覆盖多少个同名 Skill。
:::

## Tab 3 —— 导入

四个入口：

### 从文件导入

上传一个包含单个 Skill 目录的 `.zip`。

### 从 URL 导入

粘贴一条 `https://...` URL，指向一份原始 `SKILL.md`。服务端拉下来后作为单文件 Skill 安装（无子文件）。多文件 Skill 用**从文件导入**走 zip 路径。

::: info 只接受 HTTPS、只接受原始 SKILL.md
URL 导入器有意做窄 —— 它只抓一份 Markdown 文件。再复杂（多文件、二进制）的就走 zip 路径。导入面保持小而可预测。
:::

### 导入出厂

跟「浏览出厂」tab 的**全量导入出厂**是同一个动作，这里列出便于发现。

### 从角色卡 / 预设抽取

导入带 `embedded_skills_source` 字段的角色卡（PNG）或预设（JSON）时，Atria 会自动弹出预览对话框：

![嵌入导入预览](/screenshots/skills/embed-import-preview.png)

对话框逐项列出每个嵌入的 Skill 及其冲突状态。对每个冲突，你可选**跳过**（保留本地版本）或**替换**（用嵌入里的版本）。内容相同的项（`相同`）会静默不操作；新条目（`新`）直接安装。

抽取后角色卡 / 预设磁盘文件里的嵌入载荷被移除 —— Skill 现在住在 `skills/character/<file>/` 或 `skills/preset/<preset>/` 里。这样避免「过期嵌入」陷阱：内联载荷与已落地的文件版本不一致。

## 内嵌编辑器

点击 Skill 行的**编辑**会打开弹窗内编辑器：

![内嵌 Skill 编辑器](/screenshots/skills/skill-editor.png)

- 左栏：文件树（SKILL.md + 任何子文件）。点击切换。
- 右栏：Markdown 编辑器，frontmatter 区段有 YAML 感知高亮。
- 顶栏：文件路径、未保存标记、**保存**（走 `.staging/` 并原子提交）、**新增文件**（在你指定的路径创建一份新子文件）。

失败的写入对原文件零影响。

`SKILL.md` 是特殊的 —— 你能编辑它但不能从编辑器里删它（它是必需入口）。Skill 本身可通过行内动作整体删除。

## 嵌入导出 —— 到预设和角色卡

Skill 在跟它所依赖的产物（角色卡、预设）一起分发时最有用。某张角色卡需要某条口吻规则，某个预设是为特定子代理调出来的 —— 两者都能把 Skill 内联打包。

### 打包进预设

打包器把这些 Skill 写进预设的 `extensions.atria.embedded_skills_source` 字段。下一次保存预设时，嵌入随 JSON 一起被持久化。其他 Atria 用户导入这份预设时会看到上文描述的嵌入抽取对话框。

### 打包进角色卡

在角色卡编辑器里，**出厂 Skill** 区段也是同样的逻辑：选 Skill、打包，它们写进 `data.extensions.atria.embedded_skills_source`。PNG 导出时嵌入序列化进卡的元数据，分发这张卡也就分发了 Skill。

::: tip 内联 vs zip 的阈值
小且只含文本的 Skill 走 `inline-files-v1` 格式（Markdown 内容直接内嵌）。打包器按每 Skill 自动决定，你不用选。
:::

## 作用域迁移

通过行内动作**迁移到……**，你随时可以把 Skill 从 `global` → `preset` → `character`（或反向）挪。迁移是一次原子文件系统重命名 —— 没有拷贝，没有中间状态。

作用域决定当前消费者选中哪些内容。移动可能改变优先级或使当前上下文无法使用它；

典型迁移：

- **`global` → `character`** —— 你写了一条写作规则、用在多张卡上，后来发现某张卡需要一份专门变体。把它迁到那张卡的作用域，让更通用的版本留在 `global`。两者共存；卡片加载时按卡的版本胜出。
- **`preset` → `global`** —— 你打包在某个预设里的 Skill 后来发现到处都有用。把它提升到全局。
- **`character` → `global`** —— 某个角色卡专属 Skill 最终泛化了。提升它。

## 失效引用

原生消费者使用精确版本 pin；变更或缺失的 pin 必须先处理再复用。旧 profile 可见列表及静默派遣行为已不适用。

## 相关

- [Skills 概览](/zh-CN/features/skills/) —— 什么是 Skill、支持的作用域
- [创作 Skill](/zh-CN/features/skills/authoring) —— 写自己的
- [编排器集成](/zh-CN/features/native-orchestration) —— 当前原生执行边界
- [Skill 扩展 API](/zh-CN/development/extension-api/skills) —— 从扩展编程式管理
