import { execSync } from 'child_process'
import { CLIRunner } from '../../application/ports/CLIRunner.js'
import { cleanAnsi, hasPrompt } from '../claude/claudeParser.js'

export class ClaudeRunner implements CLIRunner {
  private static readonly SESSION = 'claude-reach'
  private static readonly POLL_INTERVAL = 800
  private static readonly STABLE_POLLS = 3
  private static readonly STARTUP_TIMEOUT = 60_000

  constructor(
    private readonly claudeBin: string,
    private readonly botPid: number,
  ) {}

  async start(workDir: string): Promise<void> {
    this.tmux(`new-session -d -s ${ClaudeRunner.SESSION} -x 220 -y 50`)
    const cmd = `cd ${workDir} && ${this.claudeBin} --dangerously-skip-permissions; kill -USR1 ${this.botPid} 2>/dev/null; tmux kill-session -t ${ClaudeRunner.SESSION}`
    this.tmux(`send-keys -t ${ClaudeRunner.SESSION} "${cmd}" Enter`)
    await this.waitForStablePrompt(ClaudeRunner.STARTUP_TIMEOUT)
  }

  private tmux(args: string): string {
    return execSync(`tmux ${args}`, { encoding: 'utf-8' })
  }

  private capturePane(): string {
    return this.tmux(`capture-pane -t ${ClaudeRunner.SESSION} -p -S -1000`)
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
