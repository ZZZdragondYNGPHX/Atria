# Skills

Skill 提供可重用的程序指引。安裝 Skill 不會向原生 Plan 授予工具、Source 存取權或執行權。

## Skill 的結構

一個 Skill 是一個目錄：

```
director-anti-cliche-zh/
├── SKILL.md          # 必需 —— frontmatter + 正文
├── references/       # 可選 —— 輔助清單、更長的參考資料
├── examples/         # 可選 —— 真實範例
└── assets/           # 可選 —— 二進位附件
```

`SKILL.md` 是唯一必需的檔案。它帶著 Anthropic 標準的 YAML frontmatter：

```markdown
---
name: director-anti-cliche-zh
description: 敘事寫作的反八股模式。
license: MIT
metadata:
  author: Atria Team
  version: 1.0.0
  tags: [writing-rules, zh, director]
---

# director-anti-cliche-zh

本 Skill 記錄敘事寫作中應避免的八股模式……
```

- `name` 和 `description` 是必需的。
- `license` 和 `metadata.*` 是可選的，遵循 Anthropic 標準。Atria 不引入私有命名空間。
- 正文就是「契約」—— agent 讀取這個 Skill 時，正文就是它消費的內容。要寫得直接、命令式；把「什麼時候用」「怎麼用」「優先使用哪些工具」等指導都放進正文。

完整的寫作手冊見 [創作 Skill](/zh-TW/features/skills/authoring)。

## 作用域

Skill 支援 `global`、`project`、`package`、`preset` 和 `character`。Project 路徑使用 `project/<projectId>`；Package 使用 `package/<packageId>/<packageVersionId>`；預設使用 `preset/<name>`，不含 API 段。只有屬於目前上下文的作用域參與選擇。

原生 Project/Package 按 global → project → 精確 Package 版本的順序覆寫；保留的聊天選擇按 global → 目前預設 → 角色卡覆寫。這兩種上下文不同，移動或改名可能改變實際選中的內容，編輯後應重新核對消費者。

預設和角色卡的 Skill 仍可透過 `embedded_skills_source` 隨原始資產匯出。匯入這些內容不會匯入可執行的原生 Plan。

## 呼叫與執行

在 **Extensions → Skills** 管理已安裝內容和呼叫設定。Skill 可關閉、始終納入，或在消費者支援時按需讀取。原生 RP 為 Narrator 捕獲所選始終納入指引的精確安裝版本，不把這些指引繼承給獨立 Actor。

Skill 不授予 Source 存取權或能力。Host 准入的 Plan、目前資源 pin、角色上下文和輸出契約仍是權威。目錄條目或正文裡的工具名不能證明目前執行時提供該工具。見[原生 Plan 與 Run](/zh-TW/features/native-orchestration)。

## 內建指引

內建頁列出目前隨 `default/skills/global/` 提供的寫作與方法 Skill。`director-character-voice-zh` 等名稱標識可重用指引，不啟用已退役的 Director 執行協議。安裝內容不會自動讓所有 Agent 消費它。

安裝和編輯見 [Skill 管理](/zh-TW/features/skills/management)，檔案格式及範例見[創作 Skill](/zh-TW/features/skills/authoring)。
