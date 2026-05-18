import { execSync } from 'child_process'
import { CLIRunner } from '../../application/ports/CLIRunner.js'
import { cleanAnsi, hasPrompt } from '../claude/claudeParser.js'
import { CLAUDE_BIN, TMUX_SESSION } from '../../config.js'

export class ClaudeRunner implements CLIRunner {
  private static readonly POLL_INTERVAL = 800
  private static readonly STABLE_POLLS = 3
  private static readonly STARTUP_TIMEOUT = 60_000

  constructor(private readonly botPid: number) {}

  async start(workDir: string): Promise<void> {
    if (this.sessionExists()) this.tmux(`kill-session -t ${TMUX_SESSION}`)
    await this.createSession(workDir)
  }

  isAlive(): boolean {
    return this.sessionExists() && this.isClaudeRunning()
  }

  private async createSession(workDir: string): Promise<void> {
    this.tmux(`new-session -d -s ${TMUX_SESSION} -x 220 -y 50`)
    // 對 workDir 做 shell single-quote escape，避免特殊字元被誤解析
    const safeDir = `'${workDir.replace(/'/g, `'\\''`)}'`
    const cmd = `cd ${safeDir} && ${CLAUDE_BIN} --dangerously-skip-permissions; kill -USR1 ${this.botPid} 2>/dev/null; tmux kill-session -t ${TMUX_SESSION}`
    this.tmux(`send-keys -t ${TMUX_SESSION} "${cmd}" Enter`)
    await this.waitForStablePrompt(ClaudeRunner.STARTUP_TIMEOUT)
  }

  private tmux(args: string): string {
    return execSync(`tmux ${args}`, { encoding: 'utf-8' })
  }

  private capturePane(): string {
    return this.tmux(`capture-pane -t ${TMUX_SESSION} -p -S -1000`)
  }

  private sessionExists(): boolean {
    try {
      execSync(`tmux has-session -t ${TMUX_SESSION}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      return true
    } catch {
      return false
    }
  }

  private isClaudeRunning(): boolean {
    try {
      execSync(`pgrep -f "${CLAUDE_BIN}"`, { encoding: 'utf-8' })
      return true
    } catch {
      return false
    }
  }

  private async waitForStablePrompt(timeout: number): Promise<void> {
    const begin = Date.now()
    let last = ''
    let stable = 0

    while (Date.now() - begin < timeout) {
      const current = cleanAnsi(this.capturePane())
      if (current === last && hasPrompt(current)) {
        stable++
        if (stable >= ClaudeRunner.STABLE_POLLS) return
      } else {
        stable = 0
      }
      last = current
      await new Promise((r) => setTimeout(r, ClaudeRunner.POLL_INTERVAL))
    }
    throw new Error('Claude 啟動逾時')
  }
}
