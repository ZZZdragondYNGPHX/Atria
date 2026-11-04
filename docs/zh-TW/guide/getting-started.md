# 快速開始

本指南將幫助你在幾分鐘內啟動並執行 Atria。

## 前置條件

| 依賴 | 要求 |
| --- | --- |
| **Node.js** | >= 24.0（僅 Git Clone 方式需要） |
| **Git** | 任意版本（僅 Git Clone 方式需要） |
| **Docker** | 任意現代版本（僅 Docker 方式需要） |

你還需要準備一個可用的 LLM API（OpenAI、Claude、Google Gemini、本機模型等）。

## 安裝方式一：Git Clone

適合希望自行管理和更新的使用者。

### 1. 複製儲存庫

```bash
git clone https://github.com/ZZZdragondYNGPHX/Atria.git
cd Atria
```

### 2. 安裝依賴

```bash
npm install
```

### 3. 啟動服務

```bash
node server.js
```

你也可以使用儲存庫提供的啟動腳本，它會自動安裝依賴並啟動：

```bash
bash start.sh
```

::: tip 其他執行環境
Atria 也支援透過 Deno 或 Bun 啟動：
```bash
# Deno
npm run start:deno

# Bun
npm run start:bun
```
:::

### 4. 更新

```bash
git pull
npm install
```

## 安裝方式二：Docker

適合伺服器部署或希望開箱即用的使用者。Atria 提供了預建置的 Docker 映像檔。

### 1. 建立 `docker-compose.yml`

在你希望存放資料的目錄下建立 `docker-compose.yml`：

```yaml
services:
  atria:
    image: ghcr.io/zzzdragondyngphx/atria:dev
    container_name: atria
    ports:
      - 127.0.0.1:8000:8000
    volumes:
      - ./plugins:/home/node/app/plugins
      - ./config:/home/node/app/config
      - ./data:/home/node/app/data
      - ./extensions:/home/node/app/public/scripts/extensions/third-party
    restart: unless-stopped
```

### 2. 啟動容器

```bash
docker compose up -d
```

::: warning 連接埠綁定與安全防護
預設設定將連接埠綁定到 `127.0.0.1:8000`，僅允許本機存取。如需遠端存取，請將 `127.0.0.1:8000:8000` 改為 `0.0.0.0:8000:8000`，並確保做好以下安全防護：

- **反向代理 + HTTPS**：透過 Nginx 等反向代理提供 HTTPS 加密
- **啟用登入機制**：開啟 Basic Auth（`basicAuthMode: true`）或多使用者登入（`enableUserAccounts: true`），防止未授權存取。詳見 [基礎設定](/zh-TW/guide/configuration#認證與多使用者)
:::

### 3. 更新映像檔

```bash
docker compose pull
docker compose up -d
```

## 安裝方式三：Android APK

Android 應用程式支援本機服務或已設定的遠端服務。建置和資料目錄說明見 [Android 指南](/zh-TW/guide/android)。

## 首次設定

### 存取 Atria

啟動成功後，在瀏覽器中存取：

```
http://localhost:8000
```

::: tip Android 使用者
Android 應用程式使用本機模式時會直接開啟介面，無需另用瀏覽器存取地址。
:::

### 設定 API 連線

首次進入 Atria 後，你需要設定至少一個 LLM API 才能開始對話：

1. 點擊頂部的 **API 連線** 圖示
2. 選擇你的 API 類型（如 OpenAI、Claude 等）
3. 填入 API 地址和金鑰
4. 測試連線是否成功

詳細說明請參閱 [API 連線設定](/zh-TW/basics/connections)。

### 選擇或匯入角色卡

設定好 API 後，你可以：

- 從角色卡列表中選擇一個角色開始對話
- 點擊 **匯入** 按鈕，匯入 `.png` 或 `.json` 格式的角色卡檔案

了解更多請參閱 [角色卡基礎](/zh-TW/basics/character-cards)。

## 備份與遷移

Atria 封存及舊資料匯入的範圍見[備份與遷移](/zh-TW/guide/migration)。

## 下一步

- [設定 API 連線](/zh-TW/basics/connections) — 連接你的 LLM 服務
- [了解角色卡](/zh-TW/basics/character-cards) — 開始你的第一次角色扮演
- [備份與遷移](/zh-TW/guide/migration) — 在 Atria 安裝之間遷移資料
