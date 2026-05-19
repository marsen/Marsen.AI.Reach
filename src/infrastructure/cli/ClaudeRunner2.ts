/**
 * ClaudeRunner2 —— ClaudeRunner 的下一代，多實作 ClaudePaneIO（送輸入 + 訂閱輸出）。
 *
 * 之所以叫 2：為了與舊版並存，B 路徑切換完成 + bot.ts 退場後會 rename 並搬至 infrastructure/claude/。
 */
import { execSync, spawnSync } from 'child_process'
import { setTimeout as sleep } from 'timers/promises'
import { CLIRunner } from '../../application/ports/CLIRunner.js'
import { ClaudePaneIO } from '../../application/ports/ClaudePaneIO.js'
import { cleanAnsi, hasPrompt } from '../claude/claudeParser.js'
import { CLAUDE_BIN, TMUX_SESSION } from '../../config.js'
import { log } from '../../logger.js'

export class ClaudeRunner2 implements CLIRunner, ClaudePaneIO {
  private static readonly POLL_INTERVAL_MS = 800
  private static readonly STABLE_POLLS = 3            // 連續同 N 次 capture 視為穩定
  private static readonly STARTUP_TIMEOUT_MS = 60_000

  // 觀察狀態
  private outputHandlers: Array<(text: string) => void> = []
  private pollHandle: NodeJS.Timeout | null = null
  private lastEmitted = ''   // 上次已 emit 給 handler 的全文 snapshot
  private lastSeen = ''      // 最近一次 capture 結果（用來偵測穩定）
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

  // === ClaudePaneIO ===

  async sendInput(text: string): Promise<void> {
    // 用 spawnSync + 陣列 args，避開 shell 注入
    const r = spawnSync('tmux', ['send-keys', '-t', TMUX_SESSION, text, 'Enter'], { stdio: 'pipe' })
    if (r.status !== 0) throw new Error(`tmux send-keys 失敗：${r.stderr?.toString() ?? '(no stderr)'}`)
  }

  onOutput(handler: (text: string) => void): void {
    this.outputHandlers.push(handler)
    if (!this.pollHandle) {
      this.pollHandle = setInterval(() => this.pollOnce(), ClaudeRunner2.POLL_INTERVAL_MS)
    }
  }

  // === 內部 ===

  private resetObserver(): void {
    this.lastEmitted = ''
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

    // 首次成功 capture：建立 baseline，不 emit（避免把 session 開機既有內容當作新訊息）
    if (this.lastEmitted === '') {
      this.lastEmitted = current
      this.lastSeen = current
      return
    }

    if (current !== this.lastSeen) {
      this.lastSeen = current
      this.stableCount = 0
      return
    }

    // 內容跟上次 capture 一樣 → 穩定計數 +1
    this.stableCount++
    const isStable = this.stableCount >= ClaudeRunner2.STABLE_POLLS
    const hasNewContent = current !== this.lastEmitted
    const promptShown = hasPrompt(current)
    if (!isStable || !hasNewContent || !promptShown) return

    const delta = this.diff(this.lastEmitted, current)
    log.debug(`[pane] emit candidate: stable=${this.stableCount} new=${hasNewContent} prompt=${promptShown} delta=${delta.length}`)
    if (delta) {
      for (const h of this.outputHandlers) h(delta)
    } else {
      log.debug('[pane] delta empty (curr does not startsWith prev) — skipping emit')
    }
    this.lastEmitted = current
    this.stableCount = 0
  }

  private diff(prev: string, curr: string): string {
    // 簡單前綴匹配；pane 因 history buffer 上限被 truncate 時 fall through 回空字串（保守不 emit）
    if (curr.startsWith(prev)) return curr.slice(prev.length)
    return ''
  }

  private async createSession(workDir: string): Promise<void> {
    this.tmux(`new-session -d -s ${TMUX_SESSION} -x 220 -y 50`)
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
    return this.tmux(`capture-pane -t ${TMUX_SESSION} -p -S -1000`)
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
