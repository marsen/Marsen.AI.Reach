# 系統架構概觀

## 商業目的

讓使用者離開電腦後，仍可透過行動裝置（TC）與 Claude 協同作業，並在回到電腦（PC）時看到完整的對話歷程。

## 架構圖

```
┌─────────────────────────────────────────────────────┐
│                    使用者                            │
│         PC                        TC                │
│   (tmux attach)           (Telegram / LINE)         │
└────────┬──────────────────────────┬─────────────────┘
         │                          │
         │ tmux attach              │ bot API
         ▼                          ▼
┌────────────────────┐    ┌─────────────────────┐
│   claude-reach     │    │      bot.ts          │
│   (tmux session)   │◄───│  (Platform Adapter)  │
│                    │    └─────────────────────┘
│   Claude Code CLI  │              ▲
│  --dangerously-    │         watcher（每 3 秒）
│  skip-permissions  │    偵測背景任務完成 → 推到 TC
└────────────────────┘
         ▲
         │ rai CLI（Unix socket IPC）
         │
┌────────────────────┐
│    rai 指令        │
│  start / stop /    │
│  status / init     │
└────────────────────┘
```

## 核心流程

### PC → Claude（直接操作）
使用者執行 `rai`，透過 `tmux attach` 進入 `claude-reach` session，直接與 Claude Code CLI 互動。

### TC → Claude（遠端操作）
使用者透過 Telegram / LINE 傳訊息 → bot 接收 → `tmux send-keys` 注入 session → Claude 回應 → bot 擷取回傳 TC。

### 背景通知（watcher）
watcher 每 3 秒監聽 tmux pane，偵測到 Claude 有新輸出（非 bot 主動觸發的）→ 推送到 TC。

## 平台抽象

TC 可切換為不同訊息服務（Telegram、LINE），透過 Platform Adapter 介面隔離，切換時不影響核心邏輯。

## 關鍵設計決策

- **共享媒介**：PC 與 TC 共用同一個 `claude-reach` tmux session
- **IPC**：`rai` CLI 透過 Unix socket 與 bot 溝通
- **常駐服務**：bot 透過 launchd 開機自動啟動
