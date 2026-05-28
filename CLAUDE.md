# CLAUDE.md — Marsen.AI.Reach

## 專案概述

Telegram bot，橋接使用者與 Claude Code CLI。
Tech: Node.js + TypeScript (ESM) + grammY + @inquirer/prompts

## 進度追蹤

- [x] Telegram bot 基本框架
- [x] Claude Code subprocess 整合（`--print --continue`）
- [x] Session 管理（/start /stop /status）
- [x] 訊息分段回傳（4000 字限制）
- [x] 文件建置（README、CLAUDE.md、docs/architecture/）
- [x] Claude binary 路徑移至 `.env`
- [x] tmux 架構取代 spawn（session 持久化）
- [x] CA 分層重構（domain / application / infrastructure；entry 落根層，不用 presentation）
- [x] Bug：ensureSession() 只檢查 tmux session 存在，未確認 claude process 仍在運行
- [x] Unix socket 取代 PID file（IPC）
- [x] rai CLI 工具（多專案、單實例防呆）
- [x] US1-0：npm install -g github:marsen/marsen-rai 安裝測試
- [x] WORK_DIR 重構：移除 .env，改由執行時透過 socket 傳入
- [x] CLI 改名為 rai，支援 -p 旗標、stop/status 子命令
- [x] launchd 常駐服務：rai init 自動安裝，開機自動啟動
- [x] 驗收：rai CLI 7 個使用情境
- [x] rai init 互動式精靈（@inquirer/prompts，已設定檢查）
- [x] rai 選單支援 gum choose（無 gum 自動 fallback）
- [x] Ghostty 捲動問題（tmux copy mode：Ctrl+B [）
- [x] Husky pre-commit / pre-push hooks（白名單允許 CLAUDE.md/README.md 直接進 main）
- [x] 進度通知 + 背景任務完成推送（每 30 秒「思考中」、watcher 統一管理）
- [x] CLIPaneIO 結構化 emit（❯ 解析下沉至 infra）
- [x] application service wiring 集中至 Container（lazy DI）
- [x] logger LOG_LEVEL 門檻過濾（必填、fail-loud、預設放 .env.example；含 warn 級）
- [x] Bug：daemon SIGTERM 間歇卡 mirror.stop()，shutdown 加 3s deadline 強制退出

## 架構文件

- [開發慣例](docs/architecture/conventions.md)
