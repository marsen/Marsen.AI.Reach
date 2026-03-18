# CLAUDE.md — Marsen.AI.Reach

## 專案概述

Telegram bot，橋接使用者與 Claude Code CLI。
Tech: Node.js + TypeScript (ESM) + grammY

## 進度追蹤

- [x] Telegram bot 基本框架
- [x] Claude Code subprocess 整合（`--print --continue`）
- [x] Session 管理（/start /stop /status）
- [x] 訊息分段回傳（4000 字限制）
- [x] 文件建置（README、CLAUDE.md、docs/architecture/）
- [x] Claude binary 路徑移至 `.env`
- [x] tmux 架構取代 spawn（session 持久化）
- [x] CA 分層重構（domain / application / infrastructure / presentation）
- [x] Bug：ensureSession() 只檢查 tmux session 存在，未確認 claude process 仍在運行
- [x] Unix socket 取代 PID file（IPC）
- [x] SessionLogger（~/.rai/logs/{project}/）
- [x] rai CLI 工具（多專案、單實例防呆）
- [x] US1-0：npm install -g github:marsen/marsen-rai 安裝測試
- [x] WORK_DIR 重構：移除 .env，改由執行時透過 socket 傳入
- [x] CLI 改名為 rai，支援 -p 旗標、stop/status 子命令
- [x] launchd 常駐服務：rai init 自動安裝，開機自動啟動
- [ ] 驗收：rai CLI 7 個使用情境
- [ ] Ghostty 捲動問題
- [ ] LINE 換平台

## 架構文件

- [架構設計](docs/architecture/architecture.md)
- [模組說明](docs/architecture/modules.md)
- [開發慣例](docs/architecture/conventions.md)

## 常用指令

```bash
npm run bot   # 啟動 bot
```
