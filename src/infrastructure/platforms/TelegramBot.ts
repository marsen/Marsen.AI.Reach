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
  // Telegram 單則訊息字元上限；超過 API 會拒絕，send 內自動分段
  private static readonly MAX_MESSAGE_LEN = 4096

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

  // 內部按 MAX_MESSAGE_LEN 分段；目前用字元邊界切，未來需要可改成句末或詞末切
  async send(text: string): Promise<void> {
    const max = TelegramBot.MAX_MESSAGE_LEN
    for (let i = 0; i < text.length; i += max) {
      await this.bot.api.sendMessage(this.chatId, text.slice(i, i + max))
    }
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
