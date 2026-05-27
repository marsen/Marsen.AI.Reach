# Refactor Log — #166 架構重構

## 商業邏輯角色

- **PC** — tmux 終端介面
- **TC** — Telegram 介面
- **Bot** — 中間管家，程式進入點 / 主服務
- **Claude** — AI（被 Bot 持有的資源）

PC、TC 預設代表使用者操作。

---

## 場景：PC 啟動

```mermaid
sequenceDiagram
  participant PC
  participant Bot
  participant Claude
  participant TC

  PC->>Bot: 啟動請求 + workDir
  Note over Bot: 若未運行則自我啟動
  Bot->>Claude: 建立 tmux session 並啟動 Claude
  Claude-->>Bot: 就緒
  Bot-->>PC: ready
  PC->>Claude: attach tmux 進入對話
  Bot->>TC: 「Bot 已上線」
  Bot->>TC: 「Claude session 就緒」
```

### 設計觀察

Bot 不該直接呼叫 tmux 命令。應透過介面層讓底層實作可抽換成其他 AI CLI（gemini-cli、codex 等）或其他承載方式（直接 subprocess、其他 terminal multiplexer）。

現況：`ClaudePort` 介面已存在，但有 tmux 細節滲漏（watcher / pane 概念）需收乾淨。

---

## bot vs bot2 對照

bot2 是新架構平行實驗（DDD/Hexagonal），目前只完成 1/12 項，逐步補齊。

| 類別 | bot | bot2 | 主要依賴 |
|---|---|---|---|
| **啟動 Claude（new session）** | ✓ | ✓ | `ClaudeRunner`、tmux、`claudeParser`（hasPrompt / cleanAnsi） |
| Session resume | ✓ | ✗ | `sessionExists()`、`isClaudeRunning()`（pgrep） |
| Platform adapter | ✓ | ✗ | `LineAdapter` / `TelegramAdapter`、`PLATFORM` env、`AdapterDeps` |
| Send message | ✓ | ✗ | `SendMessageUseCase`、`Session` entity、`ClaudePort.run`、tmux send-keys |
| Watcher | ✓ | ✗ | `Watcher` 類別、`WatcherPort`、`capturePane` |
| Express HTTP server | ✓ | ✗ | `express`、`adapter.router`、`adapter.httpPort` |
| Unix socket（rai CLI） | ✓ | ✗ | `net.createServer`、`~/.rai/bot.sock`、`bin/client.mjs` |
| Signal handlers | ✓ | ✗ | `process.on(SIGINT/SIGTERM/SIGUSR1)`、`uncaughtException` |
| 上線 / 異常通知 push | ✓ | ✗ | `adapter.push` |
| SessionLogger | ✓ | ✗ | `~/.rai/logs/`、`SessionLogger` 類別 |
| 訊息分段（> 4000） | ✓ | ✗ | adapter 內部處理（LINE / Telegram） |
| currentWorkDir 管理 | ✓ | ✗ | module 變數、socket `start:workDir` |

---

## 待議

### 三個檔的層次歸屬（bot2.ts / daemon-entry.ts / client.ts）

DDD 沒原生「entry point」層概念，三個檔的真實角色：

| 檔 | 角色 |
|---|---|
| `bot2.ts` | Composition root + client 進程 entry |
| `daemon-entry.ts` | Composition root + daemon 進程 entry |
| `client.ts` | 互動 UI 邏輯（被 bot2 呼叫） |

候選歸屬：
- A. 全放 `src/presentation/`（名實不符，daemon 沒 UI）
- B. 全放 `src/main/`（務實但非 DDD 用語）
- C. 拆兩處：bot2 + daemon-entry 放 `src/` 根（跟 composition.ts 同層）；client.ts 留 `src/presentation/`

暫不決，先繼續實作。

---

## 決定：商業需求對齊（2026-05-17）

繞太多技術名詞後回到商業根本，核心角色簡化為：

| 角色 | 商業意義 |
|---|---|
| 使用者 | 從 PC 或 TC 進來 |
| AI 對話階段 | 一段持續的 Claude + 對話歷史（tmux session `claude-reach`） |
| Bot | 管 AI 對話階段、跟 PC/TC 通訊的中介（常駐 daemon 進程） |
| Client | PC 端互動工具進程（跑完即退） |

Bot ↔ Client 透過 Unix socket 通訊（典型 client-server）。

## 決定：Daemon 用一個 class，不分 listener / handler（2026-05-17）

### 背景

原本設計過 `CMDListener` port + `UnixSocketCMDListener` adapter + handler 注入。多輪討論後發現對小專案是過度設計：

- 拆 listener/handler 的核心好處是「可換通訊方式」（換 HTTP、queue）
- 我們只用 socket、可預見的未來不會換
- 抽象成本（多檔案、handler 註冊概念）大於收益

### 結果

**砍掉** `CMDListener.ts`，**合併**成單一 `Daemon` class：

| 檔 | 角色 |
|---|---|
| `src/application/Daemon.ts` | 持有 socket server，dispatch 命令；public `start()` / `close()` |
| `src/presentation/daemon-entry.ts` | daemon 進程入口，三行：new、start、signal handler |

`composition.ts` 只 export adapter（cliRunner），不負責 new Daemon——由 daemon-entry 自己 new（避免 composition 因為新增業務物件而動）。

### 取捨記錄

- 失去「換通訊方式」的彈性（換 HTTP 要改 Daemon 內部）
- 換回直觀（一個 class、一個 start/close 動作）
- 未來真需要切換，再回頭抽 port

## 進度（2026-05-20）

### A 路徑（PC 端閉環）— 完成

- `BotConnection` port + `UnixSocketBotConnection` adapter
- `bot2.ts` 改寫為 daemon spawn + 互動 client
- `isAlive()` 從 `info()` 拆出來，純連線探測（不送命令）
- `Daemon.dispatch` 落實 info / start 命令

### B 路徑（TC 接通）— 主體完成

| 新增 | 角色 |
|---|---|
| `CLIPaneIO` (port) | 互動式 CLI 雙向通訊（`send` / `onMessage`） |
| `BotPort` (port) | 對話 bot 平台抽象 |
| `ClaudeRunner2` (adapter) | 同時實作 `CLIRunner` + `CLIPaneIO` |
| `TelegramBot` (adapter) | `BotPort` 的 Telegram 實作（grammY） |
| `ConversationMirror` (service) | TC ↔ CLI 雙向 mirror |
| `claudeParser.extractLastExchange` | 抽取最後一輪對話對（去 banner / cook timer / 輸入框） |
| `logger.ts` | 集中 logger |
| `config.ts` | 集中常數（SOCKET_PATH / TMUX_SESSION / CLAUDE_BIN） |

**移除**：`Watcher` / `WatcherPort` / `Watcher.test`（被 `ConversationMirror` + `ClaudeRunner2.onMessage` 取代）

### Code Review 進度

| 檔 | 狀態 |
|---|---|
| `CLIPaneIO.ts` | ✅ 改名 + 方法名 + 註解通用化 |
| `ChatPort.ts`（原 `BotPort.ts`） | ✅ 改名 + push→send + 去 TC + 4096 下沉到實作 |
| `ClaudeRunner2.ts` | 🟡 magic number 抽完；P0（v1 dead code + 改名）/ P2（onMessage side effect、邏輯重複）待 |
| `TelegramBot.ts` | ✅ 訊息分段下沉 + fire-and-forget `.catch(log)` + onMessage 就地註冊 grammY listener |
| `ConversationMirror.ts` / `.test.ts` | ✅ `claudeIO` → `cliIO`、`BotPort` → `ChatPort` 連帶改完；內部 `Claude` 字眼待議 |
| `daemon-entry.ts` | ✅ `cliPaneIO` 連帶改名 |
| `composition.ts` | ✅ `ChatPort` + `CLIPaneIO` 連帶改名 |
| `claudeParser.ts` / `logger.ts` / `config.ts` | ⏳ 未開始 |

### 命名決議

- `ClaudePaneIO` → `CLIPaneIO`：介面層不綁特定 CLI（claude / gemini / codex 都可實作）
- 方法名採對話模型：`sendInput`/`onOutput` → `send`/`onMessage`；兩個 port 對稱
- `BotPort.push` → `BotPort.send`：跟 CLIPaneIO 對稱
- `BotPort` 介面層去 TC 縮寫；TC/PC 全 codebase 退場排在 **舊 code（`bot.ts`）退場後**（路徑 B 待辦）
- `BotPort` → `ChatPort`：介面層去 Bot 字眼（89fd328）

## 進度（2026-05-23）

舊 bot.ts 流程整套退場（commit `6d392a3`）：刪 `bot.ts` / `TmuxClaudeAdapter` / `ClaudeRunner` v1 / `presentation/platforms/*` / use-cases / domain / SessionLogger / 舊 env helper。連帶刪 `docs/architecture/architecture.md` + `modules.md`（描述舊架構），README / CLAUDE.md surgical edit。

連帶解鎖（從待續移出）：
- ClaudeRunner2 P0：v1 dead code 已隨舊 code 一起退場；ClaudeRunner2 → ClaudeRunner 改名亦完成
- TC/PC 縮寫全 codebase 退場、`presentation/` → `infrastructure/` 遷移
- `claudeParser` 整進 Runner、`CLAUDE_BIN` inline、`config.ts` 瘦身

## 進度（2026-05-23）續

`presentation/` 淨空：`git mv` `bot.ts`、`daemon-entry.ts` → 根層 `src/`，`rmdir src/presentation`。imports `../` → `./`；`forkDaemon()` 用相對自身位置算 daemon-entry 路徑，兩檔同搬根層仍正確，無須改。Q1/Q2 暫緩（使用者「之後再說」）→ composition 維持根層，兩 entry 也落根層（= Q2 選項 A，可逆）。

連帶：
- launchd plist `~/Library/LaunchAgents/com.marsen.rai.plist` 的 `bot.ts` 路徑同步更新（`presentation/bot.ts` → `bot.ts`）
- bot.ts 標頭 `PC 端` → `host 端`（順手清；TC/PC 全面退場仍在待續）
- docs surgical edit：`known-issues.md`、`conventions.md`（Q1/Q2 改標暫緩 + 註明三檔暫落根層）、`CLAUDE.md`

## config / logger 歸屬討論（2026-05-24 拍板）

結論：`config`（socket 路徑 / tmux 名）與 `logger`（寫檔 I/O）**都屬 infra**。application 用到時走 **port + 注入**，不直接 import infra（守依賴方向）。

推導過程（討論記錄，避免之後重炒）：
- 「shared = 丟 infra」是誤區：infra 是最外圈，內層 import 它就是朝外依賴。穩定共用值該往中心，善變細節留 infra 後面包 port。
- 切斷 app→infra 邊的關鍵是「注入」而非「key-value 形式」：key-value 若仍 import 邊還在；改 `Map<string,string>` 注入雖免寫介面但丟型別安全＋key 變 magic string（踩 conventions），不划算。
- 「靜態方法」救不了 application：static/全域 import 等於把邊喚回；static 只有 infra→infra 用合法。
- → 最終選**抽介面（port）**：型別安全、解耦、scaling（建構子 arity 不變）兼得。此時 port **不算 speculative**——它服務「config/logger 屬 infra 且 app 要解耦」這個當下約束，非為假設未來。

**logger 已完成（本 commit）**：`application/ports/LogPort` + `infrastructure/logger.ts`（`log: LogPort`，infra 可直接 import）。`ConversationMirror` 改建構子注入 `LogPort`；infra（`ClaudeRunner`/`TelegramBot`）直接 import 具體 `log`；`daemon-entry` 注入。刪根層 `logger.ts`。

**config（ConfigPort）下一步**：同模式拆。`ConfigPort` 先只放 `socketPath`（app 端只有 `Daemon` 需要；`tmuxSession` 只 infra/entry 用不進 port）；`config.ts` → `infrastructure/config.ts`；`Daemon` 注入 `ConfigPort`。

## config → ConfigPort（推翻 path B，2026-05-26）

同日先做了 path B（raw 值注入、不開介面），隨即被推翻。完整理由鏈（避免之後重炒）：

**推翻觸發點**：先把 env 從 `~/.rai/.env` 改回專案根目錄 `.env`（commit `1a477dd`，去掉全域安裝時代的遺留）。接著討論「prod 不一定能寫 `~/.rai`」：

- 原以為 `SOCKET_PATH` 是固定常數（跨進程契約、永不變），故 path B 當常數注入。
- 但「prod 寫不了 home」證明 socket 路徑**會隨環境變** → 它是 operator config、不是常數 → 該進 `.env` + fail-loud，跟 `TELEGRAM_*` 同類。
- 一旦 config 值來自 `.env`（runtime、會變），抽 `ConfigPort` 就站得住腳（非 speculative）——這正是 path B 當時為省介面而放棄、如今條件變了該補的。
- 駁回過的替代：`XDG_RUNTIME_DIR ?? tmpdir` 的 OS-env fallback——使用者點出這仍是「`process.env.X ?? default`」，bright-line 規則不該開判斷型例外；把可寫位置交 `.env` 顯式設定，例外問題直接消失。

**最終形狀**：
- `application/ports/ConfigPort.ts`：`get(key): string`（fail-loud、禁預設）+ `CONFIG` key 常數（避免 call site magic string）
- `infrastructure/EnvConfig.ts`：讀 `process.env`，缺即 throw
- `composition.ts` → factory `createComposition(config: ConfigPort)`
- `UnixSocketBotConnection` / `Daemon`（反轉 path B 的 `socketPath: string`）/ `TelegramBot` 全改建構子注入 `ConfigPort`，用 key 取值
- **所有散落的 `process.env.X` 讀取退場**，集中到 `EnvConfig`。唯一保留直讀：`bot.ts` 的 `process.env.TMUX`——它是「在不在 tmux 內」的存在偵測、缺席是正常值，不是 config，套 fail-loud 的 ConfigPort 反而會壞（不同類別，非開例外）
- **刪** `infrastructure/config.ts`（整個檔退場）
- `SOCKET_PATH` 移入 `.env`（相對路徑 `.rai/bot.sock`，對 cwd；Unix socket 接受相對、OS 在 bind/connect 時解析，兩端 cwd 一致即可；`.gitignore` 加 `.rai/`）；`Daemon.start()` bind 前 `mkdirSync(dirname)` 由 runtime 自建目錄（dev/prod 皆然）
- **env 載入唯一起點 = bot.ts**：只有 `bot.ts` `import 'dotenv/config'`；`daemon-entry` 是 bot.ts `spawn` 的子進程、繼承其 env，**不自行載 .env**（避免第二個 .env 讀取源、又不洩漏 secret——argv 傳會被 `ps` 看到 token）

驗證：tsc 乾淨、10 tests、端到端 smoke（`.env` 讀 `SOCKET_PATH` / 相對 socket bind+connect / 缺 key fail-loud）。

## 待續

- ~~TC/PC 縮寫全 codebase 退場~~ ✅ 完成：`ConversationMirror.ts` 註解 + identifier（`lastTcInput`→`lastChatInput`、`stripUserIfFromTc`→`stripUserIfFromChat`、log `TC↔chat`）+ `.test.ts` 描述全清。TC=chat 端、PC=host 端
- ~~config → infra（path B）~~ ⚠️ **同日推翻**：先走「raw 值注入、不開介面」的 path B，當天因 prod 可寫性討論改抽 `ConfigPort`、`config.ts` 整個刪除、`SOCKET_PATH` 移入 `.env`。詳見下方「config → ConfigPort（推翻 path B）」段。
- `conventions.md` Q1 / Q2 拍板（composition.ts 與 daemon-entry.ts 歸屬，暫緩）
- **`domain/` 層待建**：conventions diagram 已標「預留層（尚未建立）」。標記為待續，等長出 session 生命週期 / 路由 / 權限政策等商業規則時再建立
- `ClaudeRunner.tmux()` 用 `execSync` 預設 `stderr: 'inherit'`，tmux session 不存在時 polling 把 `no server running` 噴到 console；改 `stdio: ['pipe', 'pipe', 'pipe']` 或 `pollOnce` 內加 `sessionExists()` 早退（低優先）
- **application service 是否進 composition / 提供 factory（稍後優先處理）**：`ConversationMirror` / `Daemon` 等 service 目前 `daemon-entry` 自己 new，跟 port-adapter 都在 composition 不對稱。usage 不足先記（只有 1-2 個 service），等更多 service 出現再決定要不要把 wiring 集中到 composition
- ~~`claudeParser` 整進 `ClaudeRunner.ts`~~ ✅ 完成：parser 三函式（`cleanAnsi`/`hasPrompt`/`extractLastExchange`）+ regex 常數移入 Runner file-scope，`extractLastExchange` export 供測試；刪 `claudeParser.ts`（連同死碼 `extractResponse`、未外用的 `PROMPT_RE` export）+ `src/infrastructure/claude/` 空目錄。測試搬 `ClaudeRunner.test.ts`（不照待續刪測，保住 regex 覆蓋率）。`CLAUDE_BIN` inline 到 Runner；`config.ts` 只剩 `TMUX_SESSION` / `SOCKET_PATH`
- **ConversationMirror 不合進 TelegramBot**：逐段拆解後內無 Telegram-specific 邏輯，剝 user 行決策是線性 chat 通用特性；唯一非通用是 `❯ ` 偵測（Claude CLI 規格），未來該下沉到 `CLIPaneIO` adapter 讓 emit 已結構化（2026-05-23 結論）
- ~~**`❯` 偵測下沉到 CLIPaneIO**~~ ✅ 完成（2026-05-27，branch `refactor/cli-structured-emit`）：`CLIPaneIO.onMessage` 改 emit 結構化 `PaneExchange { user, response, raw }`；`❯` 解析移進 `ClaudeRunner.splitExchange`（infra）；`ConversationMirror` 刪 `stripUserIfFromChat`，改依 `ex.user === lastChatInput` 判來源（chat→`response`、host→`raw`）。`❯` 字面不再出現在 application 層。去重仍用 raw 整段比對（行為不變）。host 來源保留 `❯` 前綴（走 raw）
- ~~**doc 與現實不符（待修 conventions）**~~ ✅ 完成（2026-05-26）：`conventions.md` 分層 diagram 全面對齊現實。決議**保留 `domain/`** 並標「⚠️ 預留層」（使用者要保留，非刪除——thin bridge 目前無商業規則，將來長出 session 生命週期 / 路由 / 權限政策再開）。其餘改名對齊：`claude/`→`cli/`、`ipc/`→`control/`、`use-cases/`→`services/`、platforms 範例改 `TelegramBot`、`config/` 資料夾改回 loose file `EnvConfig.ts`（單一實作不開資料夾，守 no-speculative）、加 `logger.ts`、兩個 root entry（`bot.ts`/`daemon-entry.ts`）+ `Daemon.ts` 入列。`EnvConfig.ts` 維持 infra 根層、檔名不動。
