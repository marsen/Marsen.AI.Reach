# 架構設計

## 分層規劃（Clean Architecture）

依賴方向：presentation → application → domain ← infrastructure

| 層 | 目錄 | 職責 |
|----|------|------|
| Domain | `src/domain/` | 核心概念與 Port 介面，零外部依賴 |
| Application | `src/application/` | Use Cases，協調 domain 與 port |
| Infrastructure | `src/infrastructure/` | 實作 Port（tmux adapter、env） |
| Presentation | `src/presentation/` | LINE Webhook bot（express），呼叫 use cases |

## 設計決策

### Session 狀態 → Domain Entity
Session 是核心業務概念，放在 domain entity，而非 use case 內的 flag。

### DI → 手動 Wire
目前只有一個 adapter，在 `presentation/bot.ts` 直接組裝，不引入 DI container。規模擴大後再考慮。

### ClaudePort → TmuxClaudeAdapter
透過 Port 介面隔離底層實作，未來替換成其他方案只需換 adapter，application 層不受影響。

### isClaudeRunning() → pgrep
`tmux list-panes -F "#{pane_current_command}"` 在 macOS 上回傳不可靠（回傳版本號而非進程名）。
改用 `pgrep -f "${CLAUDE_BIN}"` 直接查詢進程，確保正確判斷 Claude 是否存活。

### IPC 機制 → Unix Domain Socket（取代 PID File）

PID file 有 PID reuse 問題（`kill -0` 無法識別進程身份），shell script 可能誤判舊 PID 仍存活，送 SIGUSR2 給錯誤進程導致卡住。改用 Unix socket（`~/.rai/bot.sock`）：socket 存在且可連線即代表 bot 在跑，天然無 PID reuse 問題。`bin/client.mjs` 作為 socket client，供 shell script 查詢狀態或觸發 session 啟動。

### SessionLogger 範圍 → 僅 Bot 路徑

tmux 裡的直接互動不經過 Node.js，無法結構化攔截。`pipe-pane` 方案抓到的是含 ANSI 色碼的 raw output，難以解析為 User/Claude 格式，故決定不支援。SessionLogger 只記錄透過 bot 傳送的對話。

### Bot 常駐化 → macOS launchd

Bot process 原以 `&` 跑在 Terminal 子 process，Terminal 被 macOS App Nap 暫停時 bot 跟著停擺，造成離開後手機無法收到回應。改用 launchd 將 bot 註冊為系統服務：由 OS 管理，不受 App Nap 影響，開機自動啟動，crash 自動重啟。`rai init` 自動產生 plist 並 load。

### WORK_DIR → 執行時傳入（移除 .env 靜態設定）

Bot 作為常駐服務啟動時不知道使用者的工作目錄。將 WORK_DIR 從 .env 移除，改為使用者執行 `rai` 時透過 Unix socket 傳入（預設 `pwd`，可用 `-p` 指定）。Bot 收到後以該目錄建立 Claude tmux session。

### 訊息平台 → Platform Adapter Pattern（LINE / Telegram 動態切換）

`presentation/bot.ts` 作為容器，透過 `PLATFORM` env 動態 import 對應 adapter（`lineAdapter.js` / `telegramAdapter.js`）。所有 adapter 實作共同介面 `PlatformAdapter`（`router`、`push()`、`httpPort`），bot.ts 本身不含任何平台邏輯。

- **LINE**：`@line/bot-sdk` Webhook 模式，需 Cloudflare Named Tunnel，`httpPort: PORT`
- **Telegram**：`grammY` Long Polling 模式，不需 HTTP server，`httpPort: null`
- `bot.ts` 條件式 `app.listen`：只在 `adapter.httpPort !== null` 時啟動 HTTP server

換平台只需修改 `.env` 的 `PLATFORM` 值並重啟，application 與 domain 層不受影響。

### rai init → 互動式精靈（@inquirer/prompts）

`bin/init.mjs` 改用 `@inquirer/prompts`（select / input / password / confirm）取代 readline，提供方向鍵選單、token 遮蔽、已設定檢查等功能。設計原則：

- **不洩漏敏感值**：已設定的金鑰只顯示「已設定 ✅」，不顯示實際內容
- **可重複執行**：已設定時詢問是否重新設定，選 N 直接沿用，可用於平台切換
- **自動重啟確認**：寫入 .env 後 reload launchd service，輪詢 socket 最多 20 秒確認 bot 啟動
- **安全性**：.env 寫入後執行 `chmod 600`
- **cloudflared 整合**：LINE 平台偵測 cloudflared，引導填入 tunnel 名稱與 webhook URL，自動安裝 `com.marsen.cloudflared` launchd service

### isRunning() → 防止 session 狀態誤判

`ClaudePort` 新增 `isRunning(): boolean`，由 `TmuxClaudeAdapter` 實作（tmux session 存在 + pgrep Claude process）。bot socket 的 `status` / `info` 指令在回應前先呼叫 `isRunning()`，若 session 已消失則同步更新記憶體狀態，避免回傳「active」但 Claude 實際已死的誤判。

## 異動記錄

| 日期 | 異動描述 |
|------|---------|
| 2026-03-24 | rai init 互動式精靈：@inquirer/prompts、已設定檢查、cloudflared launchd 整合、.env chmod 600、bot 啟動確認 |
| 2026-03-21 | Platform Adapter Pattern：bot.ts 改為容器，抽出 LineAdapter / TelegramAdapter / types；httpPort 介面；條件式 app.listen；ClaudePort.isRunning() 防誤判 |
| 2026-03-19 | 訊息平台從 Telegram 改為 LINE；新增 Cloudflare Named Tunnel 設計決策 |
| 2026-03-19 | launchd 常駐服務；WORK_DIR 改為執行時傳入；CLI 改名為 rai |
| 2026-03-17 | SessionLogger 設計決策：僅記錄 bot 路徑，不記錄直接 tmux 互動 |
| 2026-03-17 | IPC 機制從 PID file 改為 Unix Domain Socket；新增 bin/client.mjs socket client；移除 PID file、SIGUSR2、session.ready file |
| 2026-03-16 | isClaudeRunning() 改用 pgrep；Long Polling 說明移至 modules.md（平台實作細節，非架構決策） |
| 2026-03-14 | 初建：確立 CA 分層規劃、Session entity、手動 Wire、TmuxClaudeAdapter 決策 |
