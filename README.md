# Marsen.AI.Reach

透過 Telegram 訊息遠端操作 Claude Code CLI 的橋接工具。

## 架構

```
Telegram User
     │
     ▼
  bot.ts          ← grammY Telegram bot，訊息收發、session 管理
     │
     ▼
claude-session.ts ← spawn Claude Code CLI (--print --continue)
     │
     ▼
 Claude Code       ← 在 WORK_DIR 執行，回傳 JSON
```


## 環境設定

複製 `.env.example` 為 `.env` 並填入：

```env
BOT_TOKEN=your_telegram_bot_token
ALLOWED_USER_ID=your_telegram_user_id
WORK_DIR=/path/to/project/for/claude
```

> `WORK_DIR` 是 Claude Code 執行時的工作目錄，預設為 `process.cwd()`。

## 啟動

```bash
npm install
npm run bot
```

## Telegram 指令

| 指令 | 說明 |
|------|------|
| `/start` | 啟動 session，開始接受訊息 |
| `/stop` | 結束 session |
| `/status` | 查看目前 session 狀態 |

啟動後直接傳訊息，bot 會轉發給 Claude Code 並回傳結果。

## 已知問題

- Claude binary 路徑寫死為 `/Users/marsen/.local/bin/claude`，未來可移至 `.env`
