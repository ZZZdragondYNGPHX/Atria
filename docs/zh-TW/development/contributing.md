# 貢獻指南

預設在本機開發、驗證、提交、合併與清理；遠端僅保存已提交結果。GitHub Actions 全部停用，包括手動執行、APK/Docker 建置及自動分支清理。

倉庫治理統一位於 `docs:README.md`（本機以 `git show docs:README.md` 讀取）。本指南說明貢獻步驟；目前使用者指令與治理定義實際任務邊界。企劃、實作記錄和即時交接統一維護在獨立 `docs` 分支，`main:docs/` 只維護產品使用與開發說明。

感謝你對 Atria 專案的關注！本文件介紹如何為 Atria 貢獻程式碼、文件和其他改進。

## 開發環境準備

1. 複製倉庫到本機，或使用現有工作區：

```bash
git clone https://github.com/ZZZdragondYNGPHX/Atria.git
cd Atria
```

2. 使用 `npm install` 安裝相依套件。
3. 使用 `node server.js` 啟動開發伺服器。

預設網址為 `http://localhost:8000`；連接埠可透過命令列參數或 `config.yaml` 設定。外部貢獻者可依需要使用 fork。

## 分支策略

- **`main`** — 穩定分支，始終保持可發布狀態。完成的產品任務在本機整合到 `main`；可選 PR 以 `main` 為目標
- 功能開發請從 `main` 建立特性分支

```bash
git checkout -b feat/my-new-feature main
```

> [!IMPORTANT]
Atria 的穩定分支是 `main`。

分支命名建議：

| 前綴 | 用途 | 範例 |
|------|------|------|
| `feat/` | 新功能 | `feat/memory-graph-export` |
| `fix/` | Bug 修復 | `fix/chat-sync-race-condition` |
| `docs/` | 文件改進 | `docs/extension-api-examples` |
| `refactor/` | 程式碼重構 | `refactor/preset-manager` |
| `chore/` | 建置/工具鏈 | `chore/update-dependencies` |

## Commit 規範

Atria 遵循 [Conventional Commits](https://www.conventionalcommits.org/) 規範：

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**類型（type）：**

| 類型 | 說明 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修復 |
| `docs` | 文件變更 |
| `style` | 程式碼格式（不影響邏輯） |
| `refactor` | 重構（不新增功能或修復 bug） |
| `perf` | 效能最佳化 |
| `test` | 測試相關 |
| `chore` | 建置/工具鏈/依賴更新 |

**範例：**

```
feat(memory-graph): add hierarchical compression for event nodes

fix(search-tools): handle empty query in web search

docs(extension-api): add examples for registerExtensionApi
```

## 本機開發流程

1. 檢查 Git 狀態，保護無關修改，建立或沿用對應任務分支。
2. 實作變更，執行最小充分的相關本機檢查。
3. 本機提交，在獨立 `docs` 分支寫入或更新同一 Record。
4. 完成的產品任務在本機合併 `main` 並核對整合結果，不重複未受影響的檢查。
5. 推送已提交結果作為儲存，清理已完成的本機及遠端任務分支。
6. 多階段任務更新 Record/HANDOFF，在正式階段邊界停止。

明確需要審閱時可使用 PR；PR 與已停用的遠端 CI 不作為預設合併門檻。

## 程式碼風格

### 基本規則

- **縮排**：4 空格
- **引號**：單引號（JavaScript）
- **分號**：必須使用
- **換行符**：LF（`\n`），不使用 CRLF
- **檔案末尾**：保留一個空行

> [!IMPORTANT]
> 所有檔案必須使用 LF 換行符。Windows 使用者請設定 Git：
> ```bash
> git config core.autocrlf input
> ```
> 或在 `.gitattributes` 中確保 `* text=auto eol=lf`。

### 命名規範

| 場景 | 風格 | 範例 |
|------|------|------|
| 變數和函式 | `camelCase` | `loadSettings()` |
| 常數 | `UPPER_SNAKE_CASE` | `DEFAULT_TIMEOUT` |
| CSS 類別名稱 | `kebab-case` | `chat-message-container` |
| 檔案名稱 | `kebab-case` | `preset-manager.js` |

### 模組系統

- **前端程式碼**：ES Module（`import`/`export`）
- **後端程式碼**：ES Module（`import`/`export`）

### 註解

- 關鍵邏輯和公共 API 需要 JSDoc 註解
- 複雜的演算法或業務邏輯應有行內註解說明意圖
- 避免無意義的註解（如 `// 增加計數器` 後面跟 `counter++`）

## 專案結構概覽

```
Atria/
├── server.js              # 伺服器入口
├── src/                   # 後端原始碼
│   ├── endpoints/         # API 路由
│   └── middleware/        # 中介軟體
├── public/                # 前端資源
│   ├── scripts/           # 前端腳本
│   │   ├── extensions/    # 內建擴充功能
│   │   │   └── third-party/  # 第三方外掛
│   │   └── ...            # 核心模組
│   └── ...                # 靜態資源
├── docs/                  # 文件（英文版位於根目錄）
│   ├── zh-CN/             # 簡體中文文件
│   └── zh-TW/             # 繁體中文文件
└── config.yaml            # 伺服器設定
```

## 測試

- 依變更行為與風險選擇最小充分檢查，不預設全量 lint/test/build。
- 優先單元/整合測試、瀏覽器自動化與模擬器。
- 只有關鍵驗收無法由自動化替代時，說明具體缺口與最小人工實機需求。
- 只有相關新變更或未解決失敗才重複已通過檢查。
- 僅報告實際執行的檢查，保留缺失證據。

## 文件貢獻

文件位於 `docs/` 目錄下，使用 Markdown 格式：

- 英文文件：`docs/`（根目錄）
- 簡體中文文件：`docs/zh-CN/`
- 繁體中文文件：`docs/zh-TW/`

文件貢獻遵循上述本機流程；Plan、Record 和 HANDOFF 歸獨立 `docs` 分支。撰寫文件時請注意：

- 使用準確的技術術語
- 程式碼和 API 名稱保留英文
- 適當使用程式碼區塊和表格
- 交叉引用：英文版使用無前綴路徑（如 `/development/contributing`），中文版使用 `/zh-CN/` 或 `/zh-TW/` 前綴
- 所有檔案使用 LF 換行符

## 回報問題

如果你發現了 bug 或有功能建議，請在 GitHub Issues 中提交。提交 Issue 時請包含：

- 問題描述
- 重現步驟（如適用）
- 預期行為與實際行為
- 環境資訊（作業系統、Node.js 版本、瀏覽器）

## 行為準則

請尊重所有貢獻者和使用者。保持友善、專業的交流態度。

## 相關頁面

- [前端外掛開發](/zh-TW/development/frontend-plugin) — 第三方外掛開發入門
- [擴充 API 參考](/zh-TW/development/extension-api/) — 完整的 API 文件
- [角色卡定製教學](/zh-TW/recipes/card-customization-walkthrough) — 使用 Studio 定製角色卡
