import type { BotPort } from '../ports/BotPort.js'
import type { ClaudePaneIO } from '../ports/ClaudePaneIO.js'
import { log } from '../../logger.js'

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

  // 記最近一則「TC → Claude」的問題；下一次 Claude emit exchange 命中即剝掉 user 行
  // 避免 TC 重複看到自己剛剛送出的問題。多輪 race 沒處理（使用者通常不會連發）。
  private lastTcInput: string | null = null

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
    log.info(`[mirror] TC→Claude: ${text.length} chars`)
    this.lastTcInput = text
    // bot 的 onMessage handler 簽名是 sync，這裡 fire-and-forget；失敗只記 log，不中斷 mirror
    this.claudeIO.sendInput(text).catch((e: unknown) => log.error('[mirror] sendInput failed', e))
  }

  private forwardToBot(text: string): void {
    log.info(`[mirror] Claude→TC: ${text.length} chars`)
    const payload = this.stripUserIfFromTc(text)
    if (!payload) return
    void this.pushChunked(payload).catch((e: unknown) => log.error('[mirror] pushChunked failed', e))
  }

  // 若 exchange 的 user 行就是最近從 TC forward 過去的問題 → 剝掉 user 行只回 response。
  // 否則（PC 來源 / 沒比中）回整段，TC 才看得到 PC 端打的問題上下文。
  private stripUserIfFromTc(exchange: string): string {
    if (this.lastTcInput === null) return exchange
    const lines = exchange.split('\n')
    const userIdx = lines.findIndex((l) => l.startsWith('❯ '))
    if (userIdx === -1) return exchange
    const userText = lines[userIdx].replace(/^❯\s+/, '').trim()
    if (userText !== this.lastTcInput.trim()) return exchange
    this.lastTcInput = null
    return lines.slice(userIdx + 1).join('\n').trim()
  }

  private async pushChunked(text: string): Promise<void> {
    const chunks = this.chunk(text)
    log.debug(`[mirror] push ${chunks.length} chunk(s)`)
    for (const chunk of chunks) {
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
