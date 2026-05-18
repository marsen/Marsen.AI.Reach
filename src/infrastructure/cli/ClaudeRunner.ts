import { execSync, spawnSync } from 'child_process'
import { setTimeout as sleep } from 'timers/promises'
import { CLIRunner } from '../../application/ports/CLIRunner.js'
import { cleanAnsi, hasPrompt } from '../claude/claudeParser.js'
import { CLAUDE_BIN, TMUX_SESSION } from '../../config.js'

export class ClaudeRunner implements CLIRunner {
  private static readonly POLL_INTERVAL = 800
  private static readonly STABLE_POLLS = 3
  private static readonly STARTUP_TIMEOUT = 60_000

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

    while (Date.now() - begin < ClaudeRunner.STARTUP_TIMEOUT) {
      const current = cleanAnsi(this.capturePane())
      if (current === last && hasPrompt(current)) {
        stable++
        if (stable >= ClaudeRunner.STABLE_POLLS) return
      } else {
        stable = 0
      }
      last = current
      await sleep(ClaudeRunner.POLL_INTERVAL)
    }
    throw new Error('Claude 啟動逾時')
  }
}
