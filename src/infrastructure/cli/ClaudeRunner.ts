/**
 * ClaudeRunner —— CLIRunner + CLIPaneIO 實作：啟動 tmux 內 Claude CLI，
 * 送輸入（send-keys），訂閱輸出（capture-pane polling）。
 */
import { execSync, spawnSync } from 'child_process'
import { setTimeout as sleep } from 'timers/promises'
import { mkdirSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { CLIRunner, CLIPaneIO, PaneExchange, LogPort } from '@ports'

const PREFIX = 'claude'  // TODO: 寫死，未來抽進 .env

// tmux session 名：ClaudeRunner 擁有；透過 CLIRunner.sessionName 暴露給 Daemon，
// daemon 再經 IPC（info 命令）回給 client，bot.ts 不直接 import。
const TMUX_SESSION = 'claude-reach'

// === Claude CLI pane 文字解析（純函式，與 tmux/process 無關，可單元測試）===

const PROMPT_RE = /❯[^\n]*\r?\n[-─]+/

function cleanAnsi(s: string): string {
  return s.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
}

function hasPrompt(output: string): boolean {
  return PROMPT_RE.test(output)
}

/**
 * 抽取「最後一輪對話」：使用者送出的訊息 + Claude 的回覆，去除 banner、cook timer、輸入框邊線。
 * 找不到回合（pane 還沒任何使用者訊息）→ 回空字串。
 */
export function extractLastExchange(pane: string): string {
  const clean = cleanAnsi(pane)

  const userInputRe = /❯ [^\s].*/g  // ❯ 後接空格再接非空白字，排除底部空白輸入框
  let lastMatch: RegExpExecArray | null = null
  let m: RegExpExecArray | null
  while ((m = userInputRe.exec(clean)) !== null) lastMatch = m
  if (!lastMatch) return ''

  // 從這則訊息開始，到下一個輸入框（PROMPT_RE）之前
  const fromExchange = clean.slice(lastMatch.index)
  const afterUserInput = fromExchange.slice(lastMatch[0].length)
  const promptIdx = afterUserInput.search(PROMPT_RE)
  const exchange = promptIdx === -1
    ? fromExchange
    : fromExchange.slice(0, lastMatch[0].length + promptIdx)

  return exchange
    .replace(/^\s*✻ .+$/gm, '')           // cook timer（思考中狀態列）
    .replace(/^\s*[─━━－-]{3,}\s*$/gm, '') // 整行裝飾線（box drawing / dash）
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 把 extractLastExchange 的原始整段拆成結構化欄位。
 * 首行是使用者輸入（`❯ ...`），其餘是 CLI 回覆。`❯` 規格只在此處被認得。
 */
export function splitExchange(raw: string): PaneExchange {
  const lines = raw.split('\n')
  const user = (lines[0] ?? '').replace(/^❯\s+/, '').trim()
  const response = lines.slice(1).join('\n').trim()
  return { user, response, raw }
}

export class ClaudeRunner implements CLIRunner, CLIPaneIO {
  readonly sessionName = TMUX_SESSION

  constructor(private readonly log: LogPort) {}

  private static readonly CONFIG = {
    POLL_INTERVAL_MS:    800,
    STABLE_POLLS:        3,       // 連續同 N 次 capture 視為穩定
    STARTUP_TIMEOUT_MS:  60_000,
    PANE_WIDTH:          220,     // 需容納 Claude UI 一行（含 cook timer / 輸入框邊框）
    PANE_HEIGHT:         50,
    SCROLL_BUFFER_LINES: 1000,    // 需 >= 一輪 exchange 可能的高度
  } as const

  // 觀察狀態
  private outputHandlers: Array<(exchange: PaneExchange) => void> = []
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

  onMessage(handler: (exchange: PaneExchange) => void): void {
    this.outputHandlers.push(handler)
    if (!this.pollHandle) {
      this.pollHandle = setInterval(() => this.pollOnce(), ClaudeRunner.CONFIG.POLL_INTERVAL_MS)
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
    if (this.stableCount < ClaudeRunner.CONFIG.STABLE_POLLS || !hasPrompt(current)) return

    // 抽出最後一輪「user + Claude 回覆」，去除 banner / cook timer / 輸入框
    const exchange = extractLastExchange(current)
    // 空字串 = 還沒有使用者訊息（剛開 session）；下次再看。lastExchange 初值也是空，自然不會誤觸 emit。
    // 去重仍用原始整段字串比對，再 split 成結構交給 handler。
    if (exchange && exchange !== this.lastExchange) {
      this.log.debug(`[pane] emit exchange (${exchange.length} chars)`)
      if (process.env.RAI_DUMP_PANE) this.dumpEmit(current, exchange)
      const msg = splitExchange(exchange)
      for (const h of this.outputHandlers) h(msg)
      this.lastExchange = exchange
    }
    this.stableCount = 0
  }

  // RAI_DUMP_PANE=1 時寫檔診斷 emit 內容
  private dumpEmit(cleanedPane: string, exchange: string): void {
    try {
      const dir = join(homedir(), '.rai', 'logs', 'pane-dumps')
      mkdirSync(dir, { recursive: true })
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const body = `=== CLEANED PANE (${cleanedPane.length} chars) ===\n${cleanedPane}\n=== EXCHANGE (${exchange.length} chars) ===\n${exchange}\n`
      writeFileSync(join(dir, `${ts}.txt`), body)
    } catch (e) {
      this.log.error('[pane-dump] failed', e)
    }
  }

  private async createSession(workDir: string): Promise<void> {
    this.tmux(`new-session -d -s ${TMUX_SESSION} -x ${ClaudeRunner.CONFIG.PANE_WIDTH} -y ${ClaudeRunner.CONFIG.PANE_HEIGHT}`)
    // 對 workDir 做 shell single-quote escape，避免特殊字元被誤解析
    const safeDir = `'${workDir.replace(/'/g, `'\\''`)}'`
    const launchClaude = `${PREFIX} --dangerously-skip-permissions`
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
    return this.tmux(`capture-pane -t ${TMUX_SESSION} -p -S -${ClaudeRunner.CONFIG.SCROLL_BUFFER_LINES}`)
  }

  private sessionExists(): boolean {
    return spawnSync('tmux', ['has-session', '-t', TMUX_SESSION], { stdio: 'pipe' }).status === 0
  }

  private isClaudeRunning(): boolean {
    // 用啟動旗標當 pattern，避免單純 'claude' 字串誤判（vim claude.md 之類）
    const pattern = `${PREFIX} --dangerously-skip-permissions`
    return spawnSync('pgrep', ['-f', pattern], { stdio: 'pipe' }).status === 0
  }

  private async waitForStablePrompt(): Promise<void> {
    const begin = Date.now()
    let last = ''
    let stable = 0

    while (Date.now() - begin < ClaudeRunner.CONFIG.STARTUP_TIMEOUT_MS) {
      const current = cleanAnsi(this.capturePane())
      if (current === last && hasPrompt(current)) {
        stable++
        if (stable >= ClaudeRunner.CONFIG.STABLE_POLLS) return
      } else {
        stable = 0
      }
      last = current
      await sleep(ClaudeRunner.CONFIG.POLL_INTERVAL_MS)
    }
    throw new Error('Claude 啟動逾時')
  }
}
