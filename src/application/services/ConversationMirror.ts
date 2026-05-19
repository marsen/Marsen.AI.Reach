import type { BotPort } from '../ports/BotPort.js'
import type { ClaudePaneIO } from '../ports/ClaudePaneIO.js'

/**
 * 把同一個 Claude 對話「鏡射」到多個介面（目前 TC，未來 App）。
 *
 * 行為：
 *   - TC 收到使用者訊息 → 灌進 Claude（PC 端 tmux 內也會看到）
 *   - Claude 有新輸出 → push 回 TC（PC 端 tmux 內已直接看到）
 *
 * 純 application 邏輯，只依賴 port，無 I/O。
 */
export class ConversationMirror {
  // Telegram 單則訊息字元上限（LINE 也類似量級，先用 Telegram 規格）
  private static readonly TELEGRAM_MAX_LEN = 4096

  constructor(
    private readonly bot: BotPort,
    private readonly claudeIO: ClaudePaneIO,
  ) {}

  async start(): Promise<void> {
    this.bot.onMessage((text) => this.forwardToClaude(text))
    this.claudeIO.onOutput((text) => this.forwardToBot(text))
    await this.bot.start()
  }

  async stop(): Promise<void> {
    await this.bot.stop()
  }

  private forwardToClaude(text: string): void {
    // bot 的 onMessage handler 簽名是 sync，這裡 fire-and-forget；失敗只記 log，不中斷 mirror
    this.claudeIO.sendInput(text).catch((e: unknown) => {
      console.error('Failed to send input to Claude:', e instanceof Error ? e.message : String(e))
    })
  }

  private forwardToBot(text: string): void {
    void this.pushChunked(text).catch((e: unknown) => {
      console.error('Failed to push to bot:', e instanceof Error ? e.message : String(e))
    })
  }

  private async pushChunked(text: string): Promise<void> {
    for (const chunk of this.chunk(text)) {
      await this.bot.push(chunk)
    }
  }

  // 按 Telegram 上限分段；目前用字元邊界切，未來需要可改成句末或詞末切
  private chunk(text: string): string[] {
    const max = ConversationMirror.TELEGRAM_MAX_LEN
    const result: string[] = []
    for (let i = 0; i < text.length; i += max) {
      result.push(text.slice(i, i + max))
    }
    return result
  }
}
