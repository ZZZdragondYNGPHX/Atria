# 日誌與診斷系統

Atria 現在以 Diagnostic Incident（診斷事件）為核心，而不是要求使用者自行從整份原始日誌尋找問題。

## 診斷工作台

入口：使用者設定 → Diagnostics / 診斷。

- Guided：預設模式，顯示最近故障、模組健康、歸因證據、關聯 ID、原因鏈，並可複製摘要或完整上下文。
- Startup：查看最近 StartupSession，比較 Server / Client / Extensions 耗時、慢階段、單擴充功能耗時、SVG 環圖與瀑布時間線。
- Expert：結構化前端/後端日誌，可按模組、級別與關鍵字篩選，支援增量刷新與虛擬化渲染。

手機端採用「列表 → 詳情」專用版面。

## Diagnostic Incident

Incident 可保存故障類型、階段、嚴重程度、關聯 ID、原因鏈、關鍵日誌、最近操作、安全設定、retry/fallback、provenance 與證據式歸因。

歸因可能是 Atria、SillyTavern 上游、第三方擴充功能、伺服器外掛、外部服務、網路/本機環境、使用者設定或 unknown。外掛參與呼叫本身不等於外掛有責任。

## 高價值故障鏈

結構化診斷已覆蓋啟動、WebSocket、generation/dispatch、智能體編排、Memory Graph、世界書、儲存、LAN Sync、備份恢復、擴充功能安裝/更新、server plugin 與 Editor/Studio。

擴充功能安裝/更新可區分 DNS、TLS、連線/逾時、Git、HTTP、manifest、檔案系統與 repository conflict。

## 啟動分析

Atria 最多保留 20 個緊湊啟動會話，支援 server phases、client 區間、extension discover/manifest/activate、script/style/locale/hook 耗時、慢項、delta 與 waterfall。

圖表使用原生 SVG，第一次打開 Startup 頁籤時才按需載入。

## Canonical store、Debug Export 與隱私

後端只有一個 canonical log store；Atria 自有前端程式碼直接使用 public/scripts/logging。

public/scripts/frontend-log-manager.js 僅保留為第三方/上游相容 shim。

Debug Export 與 Diagnostics 共用 canonical 資料來源。完整 prompt、完整訊息正文與完整 response body 不會進入診斷匯出；API Key、Authorization、Cookie、OAuth/JWT/Bearer、密碼等統一脫敏。

普通使用者不能讀取全域 backend raw logs；Incident/StartupSession 按使用者隔離；backend raw query/clear 僅管理員可用。

## 推薦回報流程

1. 重現問題；
2. 打開診斷；
3. 選擇最新 Incident 或點「我剛遇到問題」；
4. 優先複製故障摘要；
5. 需要更多證據時再複製完整上下文。
