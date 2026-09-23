# 角色卡编辑助手

角色卡编辑助手（CEA）是 Atria 面向 SillyTavern 兼容角色卡和世界书的 AI 辅助编辑器。它接收自然语言修改要求，先展示 diff，再由用户确认后应用。

CEA 现在只作为角色卡内容的兼容侧编辑工具。Native 游戏 / 项目制作统一进入 **Build → Atria Studio**，由 A7 Studio 与 A8 Project Agent 通过 ProjectStore、Authoring Operations、Workspace 和 ChangeSet 工作。

## 入口

打开 **扩展 → 角色卡编辑助手 → 打开编辑器**。

当前编辑器支持：

- 角色卡字段编辑；
- 世界书查看与编辑；
- 应用前 diff 审核；
- 迭代历史；
- 编辑助手使用的提示词 / API 预设选择。

CEA 不再提供 CardApp 运行时或 CardApp Studio 项目制作入口。

## 相关

- [普通弹窗编辑器](/zh-CN/features/card-editor/popup)
- [搜索插件](/zh-CN/features/search-tools)
