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
└── presentation/
    ├── bot.ts                       # 容器：手動 DI Wire，動態 import platform adapter，Unix socket server
    └── platforms/
        ├── types.ts                 # AdapterDeps / PlatformAdapter 介面定義
        ├── LineAdapter.ts           # LINE Webhook（@line/bot-sdk + express），httpPort: PORT
        └── TelegramAdapter.ts       # Telegram Long Polling（grammY），httpPort: null
```

## 模組職責

| 模組 | 職責 |
|------|------|
| `domain/entities/Session.ts` | 追蹤 session 活躍狀態（isActive / start / stop） |
| `domain/ports/ClaudePort.ts` | 定義 `run()` / `ensure(workDir)` / `reset(workDir)` / `isRunning()` 介面 |
| `application/use-cases/` | 協調 domain 與 port，回傳業務結果 |
| `infrastructure/claude/TmuxClaudeAdapter.ts` | 透過 tmux 控制 Claude CLI，管理 session 存活與訊息傳遞 |
| `infrastructure/config/env.ts` | 從 `.env` 讀取 LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN / ALLOWED_USER_ID / CLAUDE_BIN / PORT |
| `presentation/bot.ts` | 容器：手動 DI Wire，透過 `PLATFORM` env 動態 import adapter，啟動 HTTP server（條件式）與 Unix socket server（`~/.rai/bot.sock`） |
| `presentation/platforms/types.ts` | `AdapterDeps`（注入依賴）、`PlatformAdapter`（`router` / `push()` / `httpPort`）介面 |
| `presentation/platforms/LineAdapter.ts` | LINE Webhook：`@line/bot-sdk` middleware + express router，白名單過濾，指令處理，`httpPort: PORT` |
| `presentation/platforms/TelegramAdapter.ts` | Telegram Long Polling：grammY bot，白名單過濾，指令處理，`httpPort: null` |
| `bin/init.mjs` | 互動式設定精靈（@inquirer/prompts）：平台選擇、已設定檢查（不顯示敏感值）、寫入 .env（chmod 600）、安裝 bot + cloudflared launchd service、輪詢確認 bot 啟動 |
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
| 2026-03-24 | init.mjs 重構：@inquirer/prompts、已設定檢查、cloudflared launchd service、bot 啟動確認 |
| 2026-03-21 | Platform Adapter 重構：bot.ts 改為容器，新增 platforms/ 目錄（types / LineAdapter / TelegramAdapter）；ClaudePort 新增 isRunning()；TmuxClaudeAdapter 實作 isRunning() |
| 2026-03-19 | 訊息平台從 Telegram 改為 LINE；bot.ts 更新為 express Webhook；env.ts 移除 BOT_TOKEN 新增 LINE 金鑰；主要流程圖加入 Cloudflare Tunnel |
| 2026-03-17 | 新增 bin/ 目錄說明（ai-reach / client.mjs / init.mjs）；新增 SessionLogger；bot.ts 加入 Unix socket server 說明 |
| 2026-03-16 | 更新為 CA 四層目錄結構（domain / application / infrastructure / presentation） |
| 2026-03-14 | claude-session.ts 改為 tmux 架構 |
| 2026-03-14 | 初建 |
