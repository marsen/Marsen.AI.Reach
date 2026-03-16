# 模組說明

## 目錄結構

```
src/
├── bot.ts            # 主程式：bot 初始化、指令、訊息處理
├── claude-session.ts # Claude 溝通層（tmux 架構，待驗證）
└── config.ts         # 環境變數 (BOT_TOKEN, ALLOWED_USER_ID, WORK_DIR, CLAUDE_BIN)
```

## 模組職責

| 模組 | 職責 |
|------|------|
| `bot.ts` | grammY bot、白名單 middleware、指令（/start /stop /status）、訊息分段回傳 |
| `claude-session.ts` | 透過 tmux 控制 claude CLI，管理 session 存活與訊息傳遞 |
| `config.ts` | 從 `.env` 讀取環境變數並統一匯出 |

## 主要流程

```
Telegram User
     │
     ▼
  bot.ts  ──→  claude-session.ts  ──→  tmux session "claude-reach"
     │                                         │
     └─────────────────────────────────────────┘
              回傳結果（分段 4000 字）
```

## 安全注意事項

- `ALLOWED_USER_ID` 是唯一授權使用者，白名單邏輯在 `bot.ts` middleware
- Claude 以 `--dangerously-skip-permissions` 模式執行，等同完整系統權限，`WORK_DIR` 設定需謹慎
- `.env` 已列於 `.gitignore`，不可 commit

## 異動記錄

| 日期 | 異動描述 |
|------|---------|
| 2026-03-14 | claude-session.ts 改為 tmux 架構（待驗證） |
| 2026-03-14 | 初建 |
