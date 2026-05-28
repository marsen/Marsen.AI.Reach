# Design: LOG_LEVEL 門檻過濾

**來源**：[story-20260528-01](../stories/story-20260528-01.md)

## 分層歸屬

| 變更 | 檔案 | 層 |
| --- | --- | --- |
| 級別純邏輯（型別/驗證/env 解析） | `infrastructure/logLevel.ts`（新） | infrastructure |
| 純邏輯單元測試 | `infrastructure/logLevel.test.ts`（新） | infrastructure |
| 門檻過濾 + 消費 logLevel | `infrastructure/FileLogger.ts` | infrastructure |
| `another instance` 重新歸級 info→warn | `daemon-entry.ts` | root entry |
| 預設值 `LOG_LEVEL=INFO` | `.env.example` | config |
| 顯式檢查範例（非例外） | `docs/architecture/conventions.md` | docs |

過濾是 adapter 內部的 I/O 細節，`LogPort` 介面維持四方法不變（`warn` 已於 #18 補上）。

## 為什麼抽出 logLevel.ts

`FileLogger` 頂層會 `resolveLevel(process.env.LOG_LEVEL)`，未設即 throw。若純邏輯留在 FileLogger，測試一 import 就被頂層 throw 弄死。抽成零副作用模組後：測試直接 import `logLevel.ts`（不觸發 env 解析），FileLogger 仍在自己頂層 throw（daemon 啟動 fail-loud 不變）。

## 核心機制

```ts
// logLevel.ts —— 唯一真實來源：一份陣列同時給型別 / 驗證 / 順序（index 即優先級）
export const LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const
export type Level = typeof LEVELS[number]
export const isLevel = (s: string): s is Level => (LEVELS as readonly string[]).includes(s)

export function resolveLevel(raw: string | undefined): Level {
  if (!raw) throw new Error('LOG_LEVEL not set')                                   // 未設 → throw
  if (!isLevel(raw)) throw new Error(`LOG_LEVEL='${raw}' 無效，可用：${LEVELS.join(', ')}`) // 非法 → throw
  return raw
}
```

```ts
// FileLogger.ts
const threshold = resolveLevel(process.env.LOG_LEVEL)            // 啟動時一次；改值需重啟
function write(level: Level, msg: string): void {
  if (LEVELS.indexOf(level) < LEVELS.indexOf(threshold)) return  // 低於門檻：不寫檔也不輸出
  // ...原本 appendFileSync + console
}
```

## 關鍵決策（討論後定案）

- **LOG_LEVEL 必填、無程式碼預設**：原則「禁止 `process.env.X ?? 'default'`」沒有中間地帶——值從環境取就要顯式檢查 throw。未設 / 非法都 fail-loud。
- **「預設 INFO」放 `.env.example`**：預設變成顯式、可見、進版控的設定，不是程式裡的靜默 fallback。這是 conventions 規則的**正規用法，不是例外**。
- **不走 ConfigPort**：FileLogger 是 import 的 module 單例，非建構注入；為一個 verbosity 開關改成可注入 config 屬過度設計（YAGNI）。
- **不熱重載**：啟動讀一次，改值需 `rai` 重啟，符合 daemon 常駐模型（YAGNI）。
- **用陣列而非 `Record<Level, number>`**：index 已表達順序，免 `10/20/40` 魔數，更 KISS。

## 測試策略

`logLevel.test.ts`（純函式，無副作用）：合法值原樣、`undefined`/空字串→`not set`、非法值→`無效`、大小寫敏感、`isLevel` 真偽、`LEVELS` 順序。`write` 過濾極薄又綁 `appendFileSync` 副作用，不另測——邏輯已收斂在 `resolveLevel` 與 `LEVELS.indexOf`。手動驗收：無 `LOG_LEVEL` 啟動應炸、`LOG_LEVEL=DEBUG` vs 無設比對 `daemon.log` 差異。

## 待釐清

（無——熱重載已定為不做）
