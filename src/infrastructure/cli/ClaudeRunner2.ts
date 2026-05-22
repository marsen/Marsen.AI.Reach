/**
 * ClaudeRunner2 —— ClaudeRunner 的下一代，多實作 CLIPaneIO（送輸入 + 訂閱輸出）。
 *
 * 之所以叫 2：為了與舊版並存，B 路徑切換完成 + bot.ts 退場後會 rename 並搬至 infrastructure/claude/。
 */
import { execSync, spawnSync } from 'child_process'
import { setTimeout as sleep } from 'timers/promises'
import { mkdirSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { CLIRunner } from '../../application/ports/CLIRunner.js'
import { CLIPaneIO } from '../../application/ports/CLIPaneIO.js'
import { cleanAnsi, hasPrompt, extractLastExchange } from '../claude/claudeParser.js'
import { CLAUDE_BIN, TMUX_SESSION } from '../../config.js'
import { log } from '../../logger.js'

export class ClaudeRunner2 implements CLIRunner, CLIPaneIO {
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
      this.pollHandle = setInterval(() => this.pollOnce(), ClaudeRunner2.POLL_INTERVAL_MS)
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
    if (this.stableCount < ClaudeRunner2.STABLE_POLLS || !hasPrompt(current)) return

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
    this.tmux(`new-session -d -s ${TMUX_SESSION} -x ${ClaudeRunner2.PANE_WIDTH} -y ${ClaudeRunner2.PANE_HEIGHT}`)
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
    return this.tmux(`capture-pane -t ${TMUX_SESSION} -p -S -${ClaudeRunner2.SCROLL_BUFFER_LINES}`)
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

    while (Date.now() - begin < ClaudeRunner2.STARTUP_TIMEOUT_MS) {
      const current = cleanAnsi(this.capturePane())
      if (current === last && hasPrompt(current)) {
        stable++
        if (stable >= ClaudeRunner2.STABLE_POLLS) return
      } else {
        stable = 0
      }
      last = current
      await sleep(ClaudeRunner2.POLL_INTERVAL_MS)
    }
    throw new Error('Claude 啟動逾時')
  }
}
