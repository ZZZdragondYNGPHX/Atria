# Spec 模式

Spec 是編排器的預設模式，也是其他模式的「基準」。它把工作流拆成一串 **階段（Stage）**，每個階段裡若干 **節點（Node）** 串行或並行跑；階段間嚴格串行，前一階段所有節點都收工後才進入下一階段。每個節點 = 一次 LLM 呼叫 + 一段 prompt 模板。最後一個階段產出「作業說明」注入主模型，前面所有階段都是為它做準備。

::: tip 你已經在用了
啟用編排器時預設就是 Spec，而且自帶一套能跑的工作流（distiller、規劃、約束、審查、合成器...）。這份文件的目標是：**改預設工作流、寫新工作流、理解為什麼預設這樣設計**。
:::

::: warning 99% 的人不該手撸
手撸 stage / node 之前先看一眼 [AI 迭代工作台](/zh-TW/features/orchestrator/iteration-studio)——一句話描述需求，AI 給方案，逐條審。手撸只在工作台搞不定的極致定製場景才用。
:::

## 概念速覽

到這一節，幾個術語開始派上用場。簡短定義：

- **Stage 階段** — 工作流的橫向切片。階段間嚴格串行，Stage 2 必須等 Stage 1 跑完才能開始。
- **Node 節點** — 階段內的執行單位。**一個節點 = 一次 LLM 呼叫 + 一段 prompt 模板**。
- **DAG** — 有向無環圖。說人話就是「有先後順序、不會繞回去的流程圖」。

每個階段有一個執行方式：

- **串行** — 階段內的節點一個接一個跑
- **並行** — 節點用 `Promise.all` 同時跑

每個節點要麼是 **worker**（幹活），要麼是 **review**（審查上一階段的輸出）。

## 預設編排流程

Spec 是一條固定流水線。

預設 agent 在編排裡各自負責什麼：

| Agent | 作用 | 簡單範例（RP 場景） |
|---|---|---|
| `distiller` | 緊湊、有據可查的場景狀態快照（使用者意圖、當前張力、可能的走向）；下游所有 worker 都讀它。 | 返回「林晚自第 12 樓以來第一次問起洛陽；她在判斷要不要把家族故事講給你聽」。 |
| `lorebook_reader` | 從啟動的世界書裡挑出**這一回合**必須遵守的硬約束（文風禁令、敘事邊界、角色 / 禁忌規則、連續性錨點），寫成可執行的寫作指令。 | 返回「世界書：洛陽本季被圍，林晚不可能輕鬆離開；不得打破圍城緊張感」。 |
| `planner` | 提下一拍進程，講清因果，保留角色獨立性與世界自洽，不預設讓世界圍著使用者轉。 | 節拍：「林晚躲閃 → 使用者追問 → 她漏出一個細節 → 主回覆就停在那個細節」。 |
| `recall_relevance` | 在已召回的記憶線索裡挑出本回合真正該用的那些，按即時相關性排序；不無中生有。 | 「第 18 樓外祖母線索：高相關；第 3 樓天氣記錄：跳過」。 |
| `critic`（review 節點） | 按一整套審查口徑（連續性、OOC、世界書合規、anti-data、世界自洽 ……）審上一個 worker stage，**通過**或**點名上游某個 worker 重跑**。只下判定，不下筆改寫。 | 「grounding 通過；reason 退回 —— `planner` 讓林晚走出被圍的洛陽，與世界書衝突。重跑 `planner`：她還在城裡。」 |
| `synthesizer`（finalize 節點） | 把通過的 worker 輸出和 critic 的反饋合成成最終注入下一回合主回覆的那段編排指引 capsule。 | capsule：「林晚對洛陽話題焦慮；會躲閃，但會漏出一個家族細節。讓她留在被圍的城裡。不要用資料體敘述。」 |

## 手撸：Spec 工作流編輯器

工作台搞不定的極致定製場景，直接動 stage / node。從編排器面板打開：**打開編排編輯器**。

![Spec 編輯器](/images/orchestrator/orch-spec-editor.png)

左邊面板是工作流（階段及其節點）。右邊面板是 Agent 預設庫。每個節點引用一個預設，預設攜帶系統提示、使用者提示模板、可選的 API/Chat Completion 預設覆寫、執行旗標。

### 模板變數

使用者提示模板支援以下佔位符：

| 變數 | 含義 |
|---|---|
| <span v-pre>`{{recent_chat}}`</span> | 最近的聊天訊息 |
| <span v-pre>`{{last_user}}`</span> | 最後一條使用者訊息 |
| <span v-pre>`{{previous_outputs}}`</span> | 前序階段的輸出 |
| <span v-pre>`{{distiller}}`</span> | 蒸餾器節點的輸出 |
| <span v-pre>`{{previous_orchestration}}`</span> | 上一回合的編排結果。**運行時自動注入，模板裡一般不用寫。** |

### 審查節點

| 工具 | 作用 |
|---|---|
| `atri_orch_review_approve` | 工作合格，推進到下一階段 |
| `atri_orch_request_rerun` | 一個或多個節點需要重做，附帶修改建議 |

約束：

- 審查節點只能審 **直接相鄰的前一個工作階段** 的節點
- 重跑作用於具體節點 ID，不是整個階段
- 重跑次數受 **審查重跑最大輪數** 控制（預設 2）。設為 0 時，審查節點只能「通過或失敗」，不能重跑
- 重跑後審查節點重新跑，形成「執行 → 審查 → 重跑 → 再審查」的循環，直到通過或達到上限
- 審查節點必須輸出審查反饋

## 常見場景配方

| 我想要 | 這樣做 |
|---|---|
| AI 回覆前先想清楚情節再寫 | [AI 迭代工作台](/zh-TW/features/orchestrator/iteration-studio)描述裡加「分兩階段：先規劃下一步，再寫文」 |
| 同一個工作流跨卡通用 | 套用到全域，不要綁卡 |
| 不同卡用不同工作流 | 在角色卡選中狀態打開工作台，**套用到角色卡** |
| 太慢 / 太貴 | 見[概覽 → Step 2](/zh-TW/features/orchestrator/#step-2)；或切到 [單 Agent 模式](/zh-TW/features/orchestrator/single) 只跑一個節點 |
| 想反覆除錯同一個工作流 | 工作台的 session 會話——它會持久化 |
| 換電腦用 | 見[概覽 → 匯入匯出](/zh-TW/features/orchestrator/#匯入匯出) |
| 全部重置 | 編排編輯器有 **重置全域** 按鈕 |

## 看一次 Spec 跑

[運行面板](/zh-TW/features/orchestrator/#step-4) 會即時顯示每次 Spec 運行。每個 stage 是一張卡片，展開就能看到該 worker 的思考、流式輸出和工具呼叫。Spec 模式可以重點關注：

- **節點執行次數** —— 整條 DAG 裡所有 worker 跑過的總次數。
- **REVIEW 重跑次數** —— 審查節點驅動的重跑（預設上限 2 次，可在設定參考裡調到 0 關閉或 20 上限）。某 stage 觸發重跑時，對應 worker 會在面板裡出現兩次。
- **各 stage 輸出形態** —— 由節點的 prompt 模板決定。比如 distiller 通常輸出一段 `summary` + 一段 `xml_guidance`（帶 `<story_state>` / `<location>` / `<key_items>` 之類的標籤），後續 stage 可以解析它取結構化欄位。
- **capsule** —— **最後一個** stage 的輸出會打包注入主模型的上下文，前面所有 stage 都在為它做準備。

面板頂部的**匯出**按鈕把整次 run 下載為 JSON（便於回報問題）。

## Spec 設定參考

<details>
<summary>Spec 專屬設定</summary>

| 設定 | 說明 |
|---|---|
| 節點迭代最大輪數 | 單節點的迭代上限 |
| 審查重跑最大輪數 | 0 停用審查驅動的重跑 |
| 節點 API 預設 | 節點級覆寫；留空 = 全域 |
| 節點 Chat Completion 預設 | 節點級覆寫；留空 = 全域 |

每個節點可以用不同的 API 和 Chat Completion 預設，所以你可以讓蒸餾器走便宜模型、合成器走高品質模型。

</details>

## 相關頁面

- [編排器概覽](/zh-TW/features/orchestrator/) — 通用設定 / 觸發時機 / 角色卡綁定
- [AI 迭代工作台](/zh-TW/features/orchestrator/iteration-studio) — AI 幫你改預設 Spec 流程（99% 場景下推薦）
- [單 Agent 模式](/zh-TW/features/orchestrator/single) — 退化的 Spec，只跑一個節點
- [Agenda 模式](/zh-TW/features/orchestrator/agenda) — Planner 動態調度版本
- [Loop 模式](/zh-TW/features/orchestrator/loop) — 單 Agent 工具循環
- [自訂工具](/zh-TW/features/orchestrator/custom-tools) — Spec Agent 可以呼叫的擴充 / SillyTavern 橋接 / 手寫工具

## 預設

本模式的設定可以儲存為命名預設，並在編輯面板中切換。完整工作流程請見
[編排預設](./presets.md)。
