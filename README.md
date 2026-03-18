# Marsen.AI.Reach

透過 Telegram 訊息遠端操作 Claude Code CLI 的橋接工具。

## 安裝

```bash
npm install -g github:marsen/marsen-rai
rai init
```

`rai init` 會引導設定 `.env` 並自動安裝 macOS launchd 常駐服務（開機自動啟動）。

## 使用

```bash
rai              # 進入 Claude session（使用當前目錄）
rai -p ~/project # 指定專案目錄
rai status       # 查詢 bot 狀態與目前目錄
rai stop         # 停止服務
```

## 架構

```
手機 Telegram
     │
     ▼
  bot.ts          ← grammY Telegram bot（Long Polling）
     │  Unix socket IPC
     ▼
rai CLI           ← 使用者從終端機操作，指定工作目錄
     │
     ▼
tmux session      ← claude-reach（持久化終端）
     │
     ▼
 Claude Code CLI  ← --dangerously-skip-permissions
```

## Telegram 指令（手機端）

| 指令 | 說明 |
|------|------|
| `/start` | 啟動 Claude session |
| `/stop` | 結束 session |
| `/status` | 查看目前 session 狀態 |
| `/cleanup` | 清除 30 天前的 log |

## 設定檔

位於 `~/.rai/.env`，由 `rai init` 自動建立：

```env
BOT_TOKEN=your_telegram_bot_token
ALLOWED_USER_ID=your_telegram_user_id
CLAUDE_BIN=/usr/local/bin/claude
```

## 架構文件

- [架構設計](docs/architecture/architecture.md)
- [模組說明](docs/architecture/modules.md)
- [開發慣例](docs/architecture/conventions.md)
