# 模組說明

## 目錄結構

```
bin/
├── ai-reach          # CLI 入口（bash），偵測 bot 狀態、啟動、attach tmux
├── client.mjs        # Unix socket client，供 ai-reach 查詢 bot 狀態
└── init.mjs          # 互動式初始化精靈，寫入 ~/.ai-reach/.env
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
│   └── logger/SessionLogger.ts      # 對話 log 寫入 ~/.ai-reach/logs/{project}/
└── presentation/bot.ts           # grammY bot，手動 DI Wire，Unix socket server
```

## 模組職責

| 模組 | 職責 |
|------|------|
| `domain/entities/Session.ts` | 追蹤 session 活躍狀態（isActive / start / stop） |
| `domain/ports/ClaudePort.ts` | 定義 `run()` / `ensure()` / `reset()` 介面 |
| `application/use-cases/` | 協調 domain 與 port，回傳業務結果 |
| `infrastructure/claude/TmuxClaudeAdapter.ts` | 透過 tmux 控制 Claude CLI，管理 session 存活與訊息傳遞 |
| `infrastructure/config/env.ts` | 從 `.env` 讀取 BOT_TOKEN / ALLOWED_USER_ID / WORK_DIR / CLAUDE_BIN |
| `presentation/bot.ts` | grammY bot（Telegram）、白名單 middleware、指令處理、啟動/離線通知、Unix socket server（`~/.ai-reach/bot.sock`）。連線方式為 Long Polling（本機無公開 HTTPS，無法用 Webhook）。換平台只需替換此層。 |
| `bin/client.mjs` | Unix socket client，`status` 查詢 bot 是否在跑，`start` 觸發 Claude session 啟動並等待就緒，供 `bin/ai-reach` shell script 使用 |

## 主要流程

```
Telegram User
     │
     ▼
bot.ts (Long Polling)
     │  白名單過濾
     ├── /start  → StartSessionUseCase → TmuxClaudeAdapter.ensure()
     ├── /stop   → StopSessionUseCase
     ├── /status → Session.isActive()
     └── text    → SendMessageUseCase → TmuxClaudeAdapter.run()
                                               │
                                    tmux session "claude-reach"
                                               │
                                          Claude CLI
```

## 安全注意事項

- `ALLOWED_USER_ID` 是唯一授權使用者，白名單邏輯在 `bot.ts` middleware
- Claude 以 `--dangerously-skip-permissions` 模式執行，等同完整系統權限，`WORK_DIR` 設定需謹慎
- `.env` 已列於 `.gitignore`，不可 commit

## 異動記錄

| 日期 | 異動描述 |
|------|---------|
| 2026-03-17 | 新增 bin/ 目錄說明（ai-reach / client.mjs / init.mjs）；新增 SessionLogger；bot.ts 加入 Unix socket server 說明 |
| 2026-03-16 | 更新為 CA 四層目錄結構（domain / application / infrastructure / presentation） |
| 2026-03-14 | claude-session.ts 改為 tmux 架構 |
| 2026-03-14 | 初建 |
