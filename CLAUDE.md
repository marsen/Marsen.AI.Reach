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

## 架構文件

- [模組說明](docs/architecture/modules.md)
- [開發慣例](docs/architecture/conventions.md)

## 常用指令

```bash
npm run bot   # 啟動 bot
```
