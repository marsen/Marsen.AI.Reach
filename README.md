# Marsen.AI.Reach

透過 Telegram 訊息遠端操作 Claude Code CLI 的橋接工具。

## 架構概覽

本專案是**兩個進程**透過 Unix Domain Socket 通訊：

```
使用者
  ↓ 執行
src/bot.ts          ← client（互動式 CLI）
  ↓ Unix Socket (SOCKET_PATH)
src/daemon-entry.ts ← server（background 常駐）
  ├── Daemon            接收 socket 命令（info / start）
  ├── ClaudeRunner      在 tmux 內啟動 Claude CLI
  ├── TelegramBot       收 Telegram 訊息
  └── ConversationMirror  Telegram ↔ Claude CLI 雙向 relay
```

**bot.ts（client）** 只做三件事：
1. 確保 daemon 在跑（若沒有就 spawn 一個）
2. 透過 socket 查狀態、送指令（start / resume）
3. 把 terminal attach 進 daemon 開的 tmux session

**daemon-entry.ts（server）** 做實際工作：
- 持續監聽 socket，回應 client 命令
- 在 tmux 內跑 Claude CLI，接 Telegram 訊息轉進去

## 快速開始

```bash
# 設定環境變數
cp .env.example .env
# 填入 TELEGRAM_BOT_TOKEN、TELEGRAM_USER_ID、SOCKET_PATH

# 若有舊 daemon 在跑，先清掉
kill $(pgrep -f daemon-entry) 2>/dev/null

# 啟動（bot.ts 會自動 spawn daemon）
npx tsx src/bot.ts
```

## .env 設定

| 變數 | 說明 |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | BotFather 給的 token |
| `TELEGRAM_USER_ID` | 允許互動的 Telegram chat ID |
| `SOCKET_PATH` | Unix socket 路徑；用固定路徑確保只有一個 daemon，例：`~/.rai/bot.sock` |

## 開發

```bash
npm test          # 跑測試
npm run lint      # ESLint（pre-commit 也會跑）
```

## 架構文件

- [開發慣例](docs/architecture/conventions.md)
