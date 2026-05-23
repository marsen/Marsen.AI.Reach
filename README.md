# Marsen.AI.Reach

透過 Telegram 訊息遠端操作 Claude Code CLI 的橋接工具。

## 安裝

```bash
npm install -g github:marsen/Marsen.AI.Reach
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

## 架構文件

- [開發慣例](docs/architecture/conventions.md)
