# 架構設計

## 分層規劃（Clean Architecture）

依賴方向：presentation → application → domain ← infrastructure

| 層 | 目錄 | 職責 |
|----|------|------|
| Domain | `src/domain/` | 核心概念與 Port 介面，零外部依賴 |
| Application | `src/application/` | Use Cases，協調 domain 與 port |
| Infrastructure | `src/infrastructure/` | 實作 Port（tmux adapter、env） |
| Presentation | `src/presentation/` | grammY bot，呼叫 use cases |

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

PID file 有 PID reuse 問題（`kill -0` 無法識別進程身份），shell script 可能誤判舊 PID 仍存活，送 SIGUSR2 給錯誤進程導致卡住。改用 Unix socket（`~/.ai-reach/bot.sock`）：socket 存在且可連線即代表 bot 在跑，天然無 PID reuse 問題。`bin/client.mjs` 作為 socket client，供 shell script 查詢狀態或觸發 session 啟動。

### SessionLogger 範圍 → 僅 Bot 路徑

tmux 裡的直接互動不經過 Node.js，無法結構化攔截。`pipe-pane` 方案抓到的是含 ANSI 色碼的 raw output，難以解析為 User/Claude 格式，故決定不支援。SessionLogger 只記錄透過 bot 傳送的對話。

### Bot 常駐化 → macOS launchd

Bot process 原以 `&` 跑在 Terminal 子 process，Terminal 被 macOS App Nap 暫停時 bot 跟著停擺，造成離開後手機無法收到回應。改用 launchd 將 bot 註冊為系統服務：由 OS 管理，不受 App Nap 影響，開機自動啟動，crash 自動重啟。`rai init` 自動產生 plist 並 load。

### WORK_DIR → 執行時傳入（移除 .env 靜態設定）

Bot 作為常駐服務啟動時不知道使用者的工作目錄。將 WORK_DIR 從 .env 移除，改為使用者執行 `rai` 時透過 Unix socket 傳入（預設 `pwd`，可用 `-p` 指定）。Bot 收到後以該目錄建立 Claude tmux session。

## 異動記錄

| 日期 | 異動描述 |
|------|---------|
| 2026-03-19 | launchd 常駐服務；WORK_DIR 改為執行時傳入；CLI 改名為 rai |
| 2026-03-17 | SessionLogger 設計決策：僅記錄 bot 路徑，不記錄直接 tmux 互動 |
| 2026-03-17 | IPC 機制從 PID file 改為 Unix Domain Socket；新增 bin/client.mjs socket client；移除 PID file、SIGUSR2、session.ready file |
| 2026-03-16 | isClaudeRunning() 改用 pgrep；Long Polling 說明移至 modules.md（平台實作細節，非架構決策） |
| 2026-03-14 | 初建：確立 CA 分層規劃、Session entity、手動 Wire、TmuxClaudeAdapter 決策 |
