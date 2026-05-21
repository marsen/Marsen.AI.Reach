/**
 * TelegramBot —— ChatPort 的 Telegram 實作（grammY 包裝）。
 *
 * 用 long-polling，本機/不開 webhook 即可跑。
 * 單一使用者：建構時帶 chatId，所有訊息只送 / 收這個 chat。
 */
import { Bot } from 'grammy'
import type { ChatPort } from '../../application/ports/ChatPort.js'
import { log } from '../../logger.js'

export class TelegramBot implements ChatPort {
  private readonly bot: Bot
  private readonly handlers: Array<(text: string) => void> = []

  constructor(token: string, private readonly chatId: number) {
    this.bot = new Bot(token)
    this.bot.on('message:text', (ctx) => {
      if (ctx.chat.id !== this.chatId) return   // whitelist：只接受指定 chat
      const text = ctx.message.text
      for (const h of this.handlers) h(text)
    })
  }

  // Telegram 單則訊息上限 4096 字元；超過會被 API 拒絕，呼叫端需自行分段
  async send(text: string): Promise<void> {
    await this.bot.api.sendMessage(this.chatId, text)
  }

  onMessage(handler: (text: string) => void): void {
    this.handlers.push(handler)
  }

  async start(): Promise<void> {
    // 先 init 確保 bot 資訊取得；bot.start() 是長時間 polling 不會 resolve，fire-and-forget
    await this.bot.init()
    // drop_pending_updates：跳過 bot 離線時積壓的訊息，避免重啟後一次倒進來
    void this.bot.start({ drop_pending_updates: true })
      .catch((e) => log.error('[telegram] polling failed', e))
  }

  async stop(): Promise<void> {
    await this.bot.stop()
  }
}
