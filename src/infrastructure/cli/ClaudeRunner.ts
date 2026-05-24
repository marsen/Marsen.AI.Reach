/**
 * ClaudeRunner —— CLIRunner + CLIPaneIO 實作：啟動 tmux 內 Claude CLI，
 * 送輸入（send-keys），訂閱輸出（capture-pane polling）。
 */
import { execSync, spawnSync } from 'child_process'
import { setTimeout as sleep } from 'timers/promises'
import { mkdirSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { CLIRunner } from '../../application/ports/CLIRunner.js'
import { CLIPaneIO } from '../../application/ports/CLIPaneIO.js'
import { TMUX_SESSION } from '../../config.js'
import { log } from '../logger.js'

// Claude CLI 啟動命令；之後要抽成環境變數 / 設定檔再改這裡
const CLAUDE_BIN = 'claude'

// === Claude CLI pane 文字解析（純函式，與 tmux/process 無關，可單元測試）===

const PROMPT_RE = /❯[^\n]*\r?\n[-─]+/
// 比對使用者已送出的訊息（不是底部空白輸入框）：❯ 後接空格再接非空白字
const USER_INPUT_RE = /❯ [^\s].*/g
// Claude 「思考中 / 已思考多少秒」的狀態列噪音
const COOK_TIMER_RE = /^\s*✻ .+$/gm
// 整行只有橫線（box drawing、半形 dash、全形 dash 等）的裝飾線
const HORIZONTAL_LINE_RE = /^\s*[─━━－-]{3,}\s*$/gm

function cleanAnsi(s: string): string {
  return s.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
}

function hasPrompt(output: string): boolean {
  return PROMPT_RE.test(output)
}

/**
 * 抽取「最後一輪對話」：使用者送出的訊息 + Claude 的回覆，去除 banner、cook timer、輸入框邊線。
 * 找不到回合（pane 還沒任何使用者訊息）→ 回空字串。
 * export 供單元測試；ClaudeRunner.pollOnce 內部也用它。
 */
export function extractLastExchange(pane: string): string {
  const clean = cleanAnsi(pane)

  // 找最後一個使用者已送出的訊息
  let lastMatch: RegExpExecArray | null = null
  let m: RegExpExecArray | null
  USER_INPUT_RE.lastIndex = 0
  while ((m = USER_INPUT_RE.exec(clean)) !== null) lastMatch = m
  if (!lastMatch) return ''

  // 從這則訊息開始，到下一個輸入框（PROMPT_RE）之前
  const fromExchange = clean.slice(lastMatch.index)
  const afterUserInput = fromExchange.slice(lastMatch[0].length)
  const promptIdx = afterUserInput.search(PROMPT_RE)
  const exchange = promptIdx === -1
    ? fromExchange
    : fromExchange.slice(0, lastMatch[0].length + promptIdx)

  // 去 cook timer、整行裝飾線、收斂多餘空行
  return exchange
    .replace(COOK_TIMER_RE, '')
    .replace(HORIZONTAL_LINE_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export class ClaudeRunner implements CLIRunner, CLIPaneIO {
  private static readonly POLL_INTERVAL_MS = 800
  private static readonly STABLE_POLLS = 3            // 連續同 N 次 capture 視為穩定
  private static readonly STARTUP_TIMEOUT_MS = 60_000
  // tmux pane 尺寸：寬度需容納 Claude UI 一行（含 cook timer / 輸入框邊框），高度給多輪對話展開
  private static readonly PANE_WIDTH = 220
  private static readonly PANE_HEIGHT = 50
  // capture-pane 往回看的行數；需 >= 一輪 exchange 可能的高度，以免 extractLastExchange 抓不到 user 行
  private static readonly SCROLL_BUFFER_LINES = 1000

  // 觀察狀態
  private outputHandlers: Array<(text: string) => void> = []
  private pollHandle: NodeJS.Timeout | null = null
  private lastExchange = ''   // 上次抓到的「user + Claude」對話對
  private lastSeen = ''       // 最近一次 capture 結果（用來偵測穩定）
  private stableCount = 0

  // === CLIRunner ===

  async start(workDir: string): Promise<void> {
    if (this.sessionExists()) this.tmux(`kill-session -t ${TMUX_SESSION}`)
    await this.createSession(workDir)
    this.resetObserver()
  }

  isAlive(): boolean {
    return this.sessionExists() && this.isClaudeRunning()
  }

  // === CLIPaneIO ===

  async send(text: string): Promise<void> {
    // 用 spawnSync + 陣列 args，避開 shell 注入
    const r = spawnSync('tmux', ['send-keys', '-t', TMUX_SESSION, text, 'Enter'], { stdio: 'pipe' })
    if (r.status !== 0) throw new Error(`tmux send-keys 失敗：${r.stderr?.toString() ?? '(no stderr)'}`)
  }

  onMessage(handler: (text: string) => void): void {
    this.outputHandlers.push(handler)
    if (!this.pollHandle) {
      this.pollHandle = setInterval(() => this.pollOnce(), ClaudeRunner.POLL_INTERVAL_MS)
    }
  }

  // === 內部 ===

  private resetObserver(): void {
    this.lastExchange = ''
    this.lastSeen = ''
    this.stableCount = 0
  }

  private pollOnce(): void {
    let current: string
    try {
      current = cleanAnsi(this.capturePane())
    } catch {
      return   // session 還沒起或剛被 kill，下次再試
    }

    if (current !== this.lastSeen) {
      this.lastSeen = current
      this.stableCount = 0
      return
    }

    // 內容跟上次 capture 一樣 → 穩定計數 +1
    this.stableCount++
    if (this.stableCount < ClaudeRunner.STABLE_POLLS || !hasPrompt(current)) return

    // 抽出最後一輪「user + Claude 回覆」，去除 banner / cook timer / 輸入框
    const exchange = extractLastExchange(current)
    // 空字串 = 還沒有使用者訊息（剛開 session）；下次再看。lastExchange 初值也是空，自然不會誤觸 emit。
    if (exchange && exchange !== this.lastExchange) {
      log.debug(`[pane] emit exchange (${exchange.length} chars)`)
      this.dumpEmit(current, exchange) // TODO #166-debug: 暫時診斷 3 連 emit
      for (const h of this.outputHandlers) h(exchange)
      this.lastExchange = exchange
    }
    this.stableCount = 0
  }

  // TODO #166-debug: 暫時診斷碼，找完 3 連 emit 根因後移除
  private dumpEmit(cleanedPane: string, exchange: string): void {
    try {
      const dir = join(homedir(), '.rai', 'logs', 'pane-dumps')
      mkdirSync(dir, { recursive: true })
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const body = `=== CLEANED PANE (${cleanedPane.length} chars) ===\n${cleanedPane}\n=== EXCHANGE (${exchange.length} chars) ===\n${exchange}\n`
      writeFileSync(join(dir, `${ts}.txt`), body)
    } catch (e) {
      log.error('[pane-dump] failed', e)
    }
  }

  private async createSession(workDir: string): Promise<void> {
    this.tmux(`new-session -d -s ${TMUX_SESSION} -x ${ClaudeRunner.PANE_WIDTH} -y ${ClaudeRunner.PANE_HEIGHT}`)
    // 對 workDir 做 shell single-quote escape，避免特殊字元被誤解析
    const safeDir = `'${workDir.replace(/'/g, `'\\''`)}'`
    const launchClaude = `${CLAUDE_BIN} --dangerously-skip-permissions`
    const cleanupSession = `tmux kill-session -t ${TMUX_SESSION}`
    // cd 失敗 → 整段中止（&&）；Claude 退出（無論成敗）→ 必跑 cleanup（;）
    const cmd = `cd ${safeDir} && ${launchClaude}; ${cleanupSession}`
    this.tmux(`send-keys -t ${TMUX_SESSION} "${cmd}" Enter`)
    await this.waitForStablePrompt()
  }

  private tmux(args: string): string {
    return execSync(`tmux ${args}`, { encoding: 'utf-8' })
  }

  private capturePane(): string {
    return this.tmux(`capture-pane -t ${TMUX_SESSION} -p -S -${ClaudeRunner.SCROLL_BUFFER_LINES}`)
  }

  private sessionExists(): boolean {
    return spawnSync('tmux', ['has-session', '-t', TMUX_SESSION], { stdio: 'pipe' }).status === 0
  }

  private isClaudeRunning(): boolean {
    // 用啟動旗標當 pattern，避免單純 'claude' 字串誤判（vim claude.md 之類）
    const pattern = `${CLAUDE_BIN} --dangerously-skip-permissions`
    return spawnSync('pgrep', ['-f', pattern], { stdio: 'pipe' }).status === 0
  }

  private async waitForStablePrompt(): Promise<void> {
    const begin = Date.now()
    let last = ''
    let stable = 0

    while (Date.now() - begin < ClaudeRunner.STARTUP_TIMEOUT_MS) {
      const current = cleanAnsi(this.capturePane())
      if (current === last && hasPrompt(current)) {
        stable++
        if (stable >= ClaudeRunner.STABLE_POLLS) return
      } else {
        stable = 0
      }
      last = current
      await sleep(ClaudeRunner.POLL_INTERVAL_MS)
    }
    throw new Error('Claude 啟動逾時')
  }
}
