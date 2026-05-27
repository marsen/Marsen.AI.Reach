# 開發慣例

## 架構分層原則

> 採 Clean / Hexagonal 風格，後端為主。

### 分層結構

```text
src/
├── domain/              # 高內聚商業邏輯（純函式，可單元測試）
│   ├── entities/        # Entity（核心資料 + 行為）
│   ├── value-objects/   # Value Object（若有）
│   └── services/        # 純 domain 邏輯（無 I/O）
│   # ⚠️ 預留層：本專案目前是 thin bridge（Telegram ↔ Claude CLI relay），
│   #    無豐富商業規則，尚未建立 domain/。將來長出 session 生命週期 /
│   #    路由 / 權限政策等業務規則時再開。
├── application/         # 編排流程、定義 port
│   ├── services/        # 應用服務（例：ConversationMirror）
│   ├── ports/           # 介面（application 定義給 infra 實作的契約）
│   └── Daemon.ts        # daemon 應用服務（socket server + 命令 dispatch）
├── infrastructure/      # 實作 port、處理 I/O 與外部系統
│   ├── cli/             # 例：ClaudeRunner（CLI 介面，不綁特定 CLI）
│   ├── control/         # 例：UnixSocketBotConnection（host CLI ↔ daemon IPC）
│   ├── platforms/       # 例：TelegramBot（chat 平台）
│   ├── EnvConfig.ts     # 環境變數讀取（ConfigPort 實作）
│   ├── FileLogger.ts    # 寫檔 + console logger（LogPort 實作）
│   └── composition.ts   # 依賴裝配（port → adapter wiring）
├── bot.ts               # 唯一使用者入口
└── daemon-entry.ts      # daemon 進程入口（位置待議）
```

### 依賴鐵則

- **內層不知道外層存在**：domain 不能 import `net`、`fs`、`express`；application 不能 import 任何 adapter
- **外層透過 port 跟內層說話**：infrastructure 實作 application 定義的 port
- **composition 例外**：可以同時 import port + adapter（這是它唯一職責）
- **entry 例外**：可以 import composition + 任何層

### 各層職責

| 層 | 職責 | 不該做的 |
| --- | --- | --- |
| **domain** | 表達商業概念與規則 | 任何 I/O、framework |
| **application** | 編排 domain、呼叫 port 取得外部能力 | 直接 import infra |
| **infrastructure** | 實作 port、處理 I/O、依賴裝配（含 `composition.ts` wiring 與 `daemon-entry.ts` 內部進程入口） | 跨層被 domain/application 知道 |
| **root entry** | 唯一使用者入口（`bot.ts`），載入 .env、呼叫 infrastructure/composition | 包含商業邏輯 |

### presentation/ 為何不使用

Hex 原本區分 driving adapter（input）/ driven adapter（output），實作上兩者都是邊界 adapter，分兩層在後端為主的專案職責重疊。**統一放 `infrastructure/`**，需要時用子資料夾分主題（`claude/`、`platforms/`、`ipc/`、`config/`）即可。

### composition.ts 與 daemon-entry.ts 歸屬（2026-05-27 拍板）

`composition.ts` 放 `infrastructure/`。理由：依賴裝配是具體技術職責——若引入 DI framework（inversify / awilix），container config 自然屬 infrastructure；手寫 `new` 是同一件事的輕量版，放同一層保持一致。`daemon-entry.ts` 歸屬待議（見根層）。

---

## 程式碼原則

### 禁止 magic number

程式碼內不能有意義不明的字面數字 / 字串常數。

- **數字 / 字串字面值** → 命名為 `const`，加註解說明來由
- **例外**：`0`、`1`、`-1`、`2` 等明顯語意的（陣列索引、布林反向等）可直接使用
- **測試資料**：可用字面值，但若反覆出現相同值，仍應命名

```ts
// ❌ 不行
setTimeout(retry, 4000)
if (text.length > 4096) split(text)

// ✅ OK
const TELEGRAM_MAX_LEN = 4096   // Telegram 單則訊息字元上限
const RETRY_INTERVAL_MS = 4000  // 每次重試間隔
setTimeout(retry, RETRY_INTERVAL_MS)
if (text.length > TELEGRAM_MAX_LEN) split(text)
```

### 禁止 `process.env.X ?? 'default'`

預設值會讓「環境變數忘了設」的 bug 靜默通過，違反 fail-loud 原則。

- 值固定 → 寫死常數 + 註解（例：`const CLAUDE_BIN = 'claude' // TODO: 抽環境變數`）
- 值需從環境取 → `const x = process.env.X` 後**顯式檢查**：`if (!x) throw new Error('X not set')`
- 還沒決定來源 → 先寫死，等需要再改

### Fire-and-forget Promise 必須 `.catch(log)`

用 `void`、不 `await` 的長壽 Promise（polling、subscribe、watcher 等），若中途 reject 沒人接，error 會被完全吞掉——服務已死但 log 沒記、健康檢查還回正常，問題排查無從下手。

```ts
// ❌ 不行
void this.bot.start({ drop_pending_updates: true })

// ✅ OK
void this.bot.start({ drop_pending_updates: true })
  .catch((e) => log.error('[telegram] polling failed', e))
```

- 任何 `void promise` / 沒 `await` 的長壽 Promise 都要加 `.catch`
- catch 內至少 `log.error`，至於要不要重啟、上報、退出 process 視情境決定
- 一次性短 Promise（`fs.writeFile` 寫個 log）可豁免——拋上去也沒人接，但反正不是 silent 死服務

## Git 工作流程

### 分支命名

格式：`<type>/短名稱` 或 `<type>/NNN-短名稱`

| Prefix | 用途 |
| --- | --- |
| `feat/` | 新功能 |
| `fix/` | 修 bug |
| `refactor/` | 重構 |
| `docs/` | 文件 |

**不可直接 commit 到 `main`。**

### Commit 格式（Conventional Commits）

```text
feat: 新增 xxx 功能
fix: 修正 xxx 問題
refactor: 重構 xxx
docs: 更新文件
chore: 雜項調整
```
