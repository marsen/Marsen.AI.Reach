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
- [x] SessionLogger（~/.ai-reach/logs/{project}/）
- [x] ai-reach CLI 工具（多專案、單實例防呆）
- [x] US1-0：npm install -g github:marsen/marsen-ai-reach 安裝測試

## 架構文件

- [架構設計](docs/architecture/architecture.md)
- [模組說明](docs/architecture/modules.md)
- [開發慣例](docs/architecture/conventions.md)

## 常用指令

```bash
npm run bot   # 啟動 bot
```
