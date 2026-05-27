# Design: Watcher 從 TmuxClaudeAdapter 抽離

**來源**：[story-20260514-04](../stories/story-20260514-04.md)

## 問題描述

watcher 邏輯（去重、isProcessing 跳過、snapshot 比對）與 tmux 基礎設施（capturePane、sessionExists）混在 `TmuxClaudeAdapter` 裡，導致邏輯無法獨立測試。

## 耦合點盤點

目前 watcher 在 `TmuxClaudeAdapter` 中依賴：

| 依賴 | 性質 | 問題 |
|------|------|------|
| `capturePane()` | tmux 指令（Infrastructure） | 無法 mock |
| `sessionExists()` | tmux 指令（Infrastructure） | 無法 mock |
| `isProcessing` | module-level 共享變數 | 與 runClaude 緊耦合 |
| `lastPaneSnapshot` | watcher 狀態 | 混在 TmuxClaudeAdapter |
| `watcherTimer` | watcher 狀態 | 混在 TmuxClaudeAdapter |
| `hasPrompt()` | Claude 輸出解析 | 邏輯散落 |
| `extractResponse()` | Claude 輸出解析 | 邏輯散落 |
| `cleanAnsi()` | 工具函數 | 尚可接受 |

## 介面設計

### WatcherPort（Domain 層）

bot.ts 透過此介面與 Watcher 互動，不依賴具體實作：

```typescript
// src/domain/ports/WatcherPort.ts
export interface WatcherPort {
  start(onNewContent: (content: string) => void): void
  stop(): void
  setLastNotified(response: string): void
}
```

`setLastNotified` 讓 `runClaude` 完成後通知 watcher「這個回應已送出，不要重推」。

### WatcherContext（Infrastructure 層）

Watcher 實作所需的注入介面：

```typescript
// src/infrastructure/claude/Watcher.ts（同檔）
export interface WatcherContext {
  getPane: () => string           // 取得目前 pane 內容
  isProcessing: () => boolean     // bot 是否正在處理 TC 訊息
  sessionExists: () => boolean    // tmux session 是否存在
}
```

## 層次決定

| 元件 | 層次 | 路徑 |
|------|------|------|
| `WatcherPort` | Domain | `src/domain/ports/WatcherPort.ts` |
| `Watcher`（實作） | Infrastructure | `src/infrastructure/claude/Watcher.ts` |
| `Watcher.test.ts` | — | `src/infrastructure/claude/Watcher.test.ts` |

**理由**：
- `WatcherPort` 是 domain 層定義的抽象（bot.ts 依賴介面而非實作）
- `Watcher` 實作涉及 tmux 輸出解析，屬 Infrastructure
- 符合 Clean Architecture：內層定義介面，外層提供實作

## 實作結構

```typescript
// src/infrastructure/claude/Watcher.ts
export class Watcher implements WatcherPort {
  private lastSnapshot = ''
  private lastNotified = ''
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly ctx: WatcherContext) {}

  start(onNewContent: (content: string) => void): void { ... }
  stop(): void { ... }
  setLastNotified(response: string): void {
    this.lastNotified = response
  }
}
```

## TmuxClaudeAdapter 的調整

1. 移除 `startWatcher`、`stopWatcher`（從 `ClaudePort` 介面移除）
2. 移除 module-level `lastPaneSnapshot`、`watcherTimer`（移入 Watcher）
3. 新增 `createWatcher(): Watcher`，回傳已注入正確 context 的 Watcher 實體
4. `runClaude` 完成後呼叫 `watcher?.setLastNotified(response)`

```typescript
// bot.ts
const watcher = claude.createWatcher()
watcher.start((content) => {
  adapter.push(`📬 背景任務完成：\n${content.slice(0, 4000)}`).catch(() => {})
})
// SIGINT / SIGTERM 時
watcher.stop()
```

## 測試案例

```typescript
describe('Watcher', () => {
  let getPane: Mock
  let isProcessing: Mock
  let sessionExists: Mock
  let watcher: Watcher

  beforeEach(() => {
    getPane = vi.fn()
    isProcessing = vi.fn().mockReturnValue(false)
    sessionExists = vi.fn().mockReturnValue(true)
    watcher = new Watcher({ getPane, isProcessing, sessionExists })
    vi.useFakeTimers()
  })

  afterEach(() => {
    watcher.stop()
    vi.useRealTimers()
  })

  describe('觸發條件', () => {
    it('pane 有新內容且有 prompt → 呼叫 onNewContent')
    it('isProcessing = true → 跳過')
    it('sessionExists = false → 跳過')
    it('pane 沒有變化 → 跳過')
    it('有新內容但沒有 prompt → 跳過')
  })

  describe('去重', () => {
    it('新回應 → 呼叫 onNewContent，更新 lastNotified')
    it('相同回應 → 不呼叫')
    it('setLastNotified 後 watcher 跳過相同內容（runClaude 防重推）')
  })

  describe('stop()', () => {
    it('stop 後不再觸發')
  })
})
```

## 符合開發原則檢查

| 原則 | 說明 |
|------|------|
| Clean Architecture | WatcherPort 在 Domain，Watcher 實作在 Infrastructure，依賴方向正確 |
| Dependency Inversion | bot.ts 依賴 WatcherPort 介面，不依賴 Watcher 具體類別 |
| 測試策略 | Infrastructure 層有邏輯 → 寫單元測試，mock 注入替代 tmux |
| YAGNI | 只抽必要的介面，不過度設計 |
| KISS | WatcherContext 三個函數，簡單清楚 |

## 待釐清

- [ ] `createWatcher()` 是否需要加入 `ClaudePort` 介面，或只是 TmuxClaudeAdapter 的具體方法？
- [ ] `hasPrompt()` 與 `extractResponse()` 是否保留在 Watcher 內，或抽成可注入的 parser？
