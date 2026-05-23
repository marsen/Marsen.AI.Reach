# 已知問題

本文件記錄已被觀察到但尚未修復的問題。修復後請從這裡移除，並在對應 commit 訊息引用。

---

## BUG-001：Session entity 與外部資源狀態不同步

**發現日期**：2026-05-15
**相關 story**：[story-20260514-02](166-arch-refactor/stories/story-20260514-02.md)（wiring 設計需要決定狀態同步邏輯的歸屬層）

### 症狀

bot 記憶體中的 `Session.active` 與「tmux session 是否存在 + Claude 進程是否在跑」沒有可靠同步機制。任一邊單獨改變，另一邊不會自動跟上，造成：

- 在 PC 端跟 Claude 對話，TC **收不到推播**（watcher 沒啟動）
- 在 TC 端送訊息被 `SendMessageUseCase` 擋下（「Session 未啟動，請先 /start」）
- 反向：Claude 已死但 `session.active=true`，TC 訊息送到不存在的 pane

### 三個未處理場景

| 場景 | `Session.active` | 外部狀態 | 結果 |
|---|---|---|---|
| Bot 重啟（launchd kickstart） | `false`（剛 new） | tmux + Claude 還在跑 | TC 對話被擋；PC 對話 watcher 沒啟動，無推播 |
| Claude 偷死 | `true` | tmux 在、Claude process 已死 | TC 訊息送到死 pane，行為未定義 |
| 外部 `tmux kill-session` | `true` | tmux 不在 | 下次 `send` 才透過 `ensureSession` 偵測重建 |

### 目前部分修補

`bot.ts` socket `info` / `status` handler：

```typescript
if (session.isActive() && !claude.isRunning()) {
  session.stop()
  stopWatcher()
}
```

只處理「active → 應該 inactive」這一個方向，且只在 socket 命令觸發時檢查。

### 需要決定的事

- **狀態同步邏輯放哪一層**？目前在 `bot.ts`，可能應抽到 application 或 domain
- **是否做雙向同步**？反方向 recovery（`inactive` 但 tmux+Claude 還在 → `session.start()` + `startWatcher()`）
- **觸發時機**：socket 命令？`SendMessage` 前？背景輪詢？
- **Source of truth 選擇**：把 tmux 當權威，每次都查；還是維持進程內快取、定期同步

### 發現經過

2026-05-15 重啟 launchd（`launchctl kickstart -k gui/501/com.marsen.rai`）載入 watcher 重構後的新 code，但 tmux session 從前一個 bot 留存。新 bot 記憶體 `Session` 是 `inactive`，PC 端 Claude 對話 watcher 沒啟動，TC 收不到推播。
