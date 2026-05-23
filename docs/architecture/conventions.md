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
├── application/         # 組合 Entity 完成流程
│   ├── use-cases/       # Use Case（可改名 services/）
│   └── ports/           # 介面（application 定義給 infra 實作的契約）
├── infrastructure/      # 實作 port、處理 I/O 與外部系統
│   ├── claude/          # 例：ClaudeRunner、claudeParser
│   ├── ipc/             # 例：UnixSocketBotConnection
│   ├── platforms/       # 例：LineAdapter、TelegramAdapter
│   └── config/          # 環境變數讀取
├── composition.ts       # Port → Adapter mapping（位置待討論，見下）
└── (root)               # main entry：bot.ts 等
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
| **infrastructure** | 實作 port、處理 I/O（HTTP、socket、DB、CLI、bot SDK 等都在此層） | 跨層被 domain/application 知道 |
| **composition** | 介面 → 實作的綁定（Port → Adapter）；**不負責 wire entry** | 包含商業邏輯 |
| **root entry** | 程式起點（main），從 composition 拿 instance 開工 | 包含商業邏輯 |

### presentation/ 為何不使用

Hex 原本區分 driving adapter（input）/ driven adapter（output），實作上兩者都是邊界 adapter，分兩層在後端為主的專案職責重疊。**統一放 `infrastructure/`**，需要時用子資料夾分主題（`claude/`、`platforms/`、`ipc/`、`config/`）即可。

### 待討論項目（暫緩，2026-05-23 決定先不拍板）

`presentation/` 已淨空：`bot.ts`、`daemon-entry.ts` 與 `composition.ts` 三者**暫時都落根層 `src/`**，未對下面兩問做架構承諾，要再搬都可逆。

#### Q1：composition.ts 放哪？

| 選項 | 論點 |
| --- | --- |
| **A. 根層**（目前狀態） | 不屬於任何層；entry 跟 composition 都是邊界外 wiring，集中根層好找 |
| **B. infrastructure/** | composition 只認識 port + adapter，沒理由放邊界外 |

#### Q2：daemon-entry.ts 放哪？

- bot.ts = 使用者**主動執行**的 entry（像 `main`）→ 共識放根層
- daemon-entry.ts = 被 bot **spawn 出來**的內部 entry → 角色不同，放根層感覺怪

選項：

- A. 都放根（一致，**目前狀態**）
- B. bot 放根、daemon-entry 進 `infrastructure/`（例如 `infrastructure/daemon/daemon-entry.ts`）
- C. 開 `bootstrap/` 資料夾，兩個都進去

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
