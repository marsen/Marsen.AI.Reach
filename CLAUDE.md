# CLAUDE.md — Marsen.AI.Reach

## 專案概述

Telegram bot，橋接使用者與 Claude Code CLI。
Tech: Node.js + TypeScript (ESM) + grammY + @inquirer/prompts

## 進度追蹤

基礎功能均已完成（Telegram bridge、tmux session、CA 分層架構、Unix socket IPC、logger LOG_LEVEL filter 等）。歷史紀錄見 git log 與 Backlog closed issues。

進行中：

- [ ] rai 多後端橋接強化（Gemini CLI 支援 + 安裝部署）— Backlog #169
  - [ ] 評估抽 `PREFIX='claude'` → 設定（Gemini 加入後）— Backlog #170
  - [ ] rai 安裝腳本：全域觸發 + 互動式 .env 設定（低優先）— Backlog #171
- 下一步：`/flow:spec 169`

## 架構文件

- [開發慣例](docs/architecture/conventions.md)
