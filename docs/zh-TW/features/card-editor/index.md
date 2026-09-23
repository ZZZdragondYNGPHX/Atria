# 角色卡編輯助手

角色卡編輯助手（CEA）是 Atria 面向 SillyTavern 相容角色卡和世界書的 AI 輔助編輯器。它接收自然語言修改要求，先展示 diff，再由使用者確認後套用。

CEA 現在只作為角色卡內容的相容側編輯工具。Native 遊戲 / 專案製作統一進入 **Build → Atria Studio**，由 A7 Studio 與 A8 Project Agent 透過 ProjectStore、Authoring Operations、Workspace 和 ChangeSet 工作。

## 入口

開啟 **擴充功能 → 角色卡編輯助手 → 開啟編輯器**。

目前編輯器支援：

- 角色卡欄位編輯；
- 世界書檢視與編輯；
- 套用前 diff 審核；
- 迭代歷史；
- 編輯助手使用的提示詞 / API 預設選擇。

CEA 不再提供 CardApp 執行環境或 CardApp Studio 專案製作入口。

## 相關

- [普通彈窗編輯器](/zh-TW/features/card-editor/popup)
- [搜尋外掛](/zh-TW/features/search-tools)
