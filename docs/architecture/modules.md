# 模組說明

## 目錄結構

```
src/
├── bot.ts            # 主程式：bot 初始化、指令、訊息處理
├── claude-session.ts # Claude Code subprocess 封裝
└── config.ts         # 環境變數 (BOT_TOKEN, ALLOWED_USER_ID, WORK_DIR)
```

## 模組職責

| 模組 | 職責 |
|------|------|
| `bot.ts` | Telegram bot 初始化、白名單 middleware、指令處理（/start /stop /status）、訊息分段回傳 |
| `claude-session.ts` | spawn Claude Code CLI subprocess，傳入訊息，解析 JSON 回傳結果 |
| `config.ts` | 從 `.env` 讀取環境變數並統一匯出 |

## 主要流程

```
Telegram User
     │
     ▼
  bot.ts  ──→  claude-session.ts  ──→  Claude Code CLI (--print --continue)
     │                                         │
     └─────────────────────────────────────────┘
              回傳結果（分段 4000 字）
```

## 安全注意事項

- `ALLOWED_USER_ID` 是唯一授權使用者，白名單邏輯在 `bot.ts` middleware
- Claude Code 以 `bypassPermissions` 模式執行，等同完整系統權限，`WORK_DIR` 設定需謹慎
- `.env` 已列於 `.gitignore`，不可 commit

