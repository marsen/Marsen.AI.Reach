# 模組說明

## 目錄結構

```
bin/
├── rai               # CLI 入口（bash），子命令 init/stop/status，attach tmux
├── client.mjs        # Unix socket client，供 rai 查詢 bot 狀態、傳入 workDir
└── init.mjs          # 互動式初始化精靈，寫入 ~/.rai/.env 並安裝 launchd 服務
src/
├── domain/
│   ├── entities/Session.ts       # Session 狀態 entity
│   └── ports/ClaudePort.ts       # Claude 抽象介面
├── application/use-cases/
│   ├── StartSessionUseCase.ts    # 啟動/接續 session
│   ├── StopSessionUseCase.ts     # 停止 session
│   └── SendMessageUseCase.ts     # 傳訊息給 Claude
├── infrastructure/
│   ├── claude/TmuxClaudeAdapter.ts  # ClaudePort 實作（tmux）
│   ├── config/env.ts                # 環境變數
│   └── logger/SessionLogger.ts      # 對話 log 寫入 ~/.rai/logs/{project}/
└── presentation/bot.ts           # LINE Webhook bot（express），手動 DI Wire，Unix socket server
```

## 模組職責

| 模組 | 職責 |
|------|------|
| `domain/entities/Session.ts` | 追蹤 session 活躍狀態（isActive / start / stop） |
| `domain/ports/ClaudePort.ts` | 定義 `run()` / `ensure(workDir)` / `reset(workDir)` 介面 |
| `application/use-cases/` | 協調 domain 與 port，回傳業務結果 |
| `infrastructure/claude/TmuxClaudeAdapter.ts` | 透過 tmux 控制 Claude CLI，管理 session 存活與訊息傳遞 |
| `infrastructure/config/env.ts` | 從 `.env` 讀取 LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN / ALLOWED_USER_ID / CLAUDE_BIN / PORT |
| `presentation/bot.ts` | LINE Webhook bot（express POST /webhook）、白名單過濾（userId）、指令處理、啟動/離線通知、Unix socket server（`~/.rai/bot.sock`）。換平台只需替換此層。 |
| `bin/client.mjs` | Unix socket client，`status`/`info` 查詢狀態，`start <workDir>` 觸發 Claude session 啟動，供 `bin/rai` 使用 |

## 主要流程

```
手機 LINE
     │
     ▼
LINE Messaging API
     │  Webhook POST
     ▼
Cloudflare Tunnel (rai.marsen.me)
     │
     ▼
bot.ts (express POST /webhook)
     │  白名單過濾（userId）
     ├── /start  → StartSessionUseCase → TmuxClaudeAdapter.ensure(workDir)
     ├── /stop   → StopSessionUseCase
     ├── /status → Session.isActive()
     └── text    → SendMessageUseCase → TmuxClaudeAdapter.run()
                                               │
                                    tmux session "claude-reach"
                                               │
                                          Claude CLI

rai CLI（使用者終端機）
     │  Unix socket
     ├── rai init    → 設定 .env + 安裝 launchd 服務
     ├── rai         → socket start:<workDir> → attach tmux
     ├── rai -p path → 同上，指定目錄
     ├── rai status  → socket info → 顯示狀態與目錄
     └── rai stop    → launchctl unload
```

## 安全注意事項

- `ALLOWED_USER_ID` 是唯一授權使用者，白名單邏輯在 `bot.ts` middleware
- Claude 以 `--dangerously-skip-permissions` 模式執行，等同完整系統權限，`WORK_DIR` 設定需謹慎
- `.env` 已列於 `.gitignore`，不可 commit

## 異動記錄

| 日期 | 異動描述 |
|------|---------|
| 2026-03-19 | 訊息平台從 Telegram 改為 LINE；bot.ts 更新為 express Webhook；env.ts 移除 BOT_TOKEN 新增 LINE 金鑰；主要流程圖加入 Cloudflare Tunnel |
| 2026-03-17 | 新增 bin/ 目錄說明（ai-reach / client.mjs / init.mjs）；新增 SessionLogger；bot.ts 加入 Unix socket server 說明 |
| 2026-03-16 | 更新為 CA 四層目錄結構（domain / application / infrastructure / presentation） |
| 2026-03-14 | claude-session.ts 改為 tmux 架構 |
| 2026-03-14 | 初建 |
