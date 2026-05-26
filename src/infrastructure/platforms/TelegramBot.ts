/**
 * TelegramBot —— ChatPort 的 Telegram 實作（grammY 包裝）。
 *
 * 用 long-polling，本機/不開 webhook 即可跑。
 * 單一使用者：所有訊息只送 / 收綁定的 chatId（從 env 讀）。
 */
import { config as dotenvConfig } from 'dotenv'
import { Bot } from 'grammy'
import type { ChatPort } from '../../application/ports/ChatPort.js'
import { log } from '../logger.js'

// 從執行目錄（repo / 部署目錄）的根 .env 載入。dev 與 prod 都只放這一份，不需額外設定。
// constructor 立刻讀 env，所以在 module load 時就 load（先於 composition `new TelegramBot()`）。
dotenvConfig()

export class TelegramBot implements ChatPort {
  // Telegram 單則訊息字元上限；超過 API 會拒絕，send 內自動分段
  private static readonly MAX_MESSAGE_LEN = 4096

  private readonly bot: Bot
  private readonly chatId: number

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN
    const chatIdRaw = process.env.TELEGRAM_USER_ID
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set')
    if (!chatIdRaw) throw new Error('TELEGRAM_USER_ID not set')
    this.chatId = Number(chatIdRaw)
    this.bot = new Bot(token)
  }

  async send(text: string): Promise<void> {
    const max = TelegramBot.MAX_MESSAGE_LEN
    for (let i = 0; i < text.length; i += max) {
      await this.bot.api.sendMessage(this.chatId, text.slice(i, i + max))
    }
  }

  onMessage(handler: (text: string) => void): void {
    // grammY 訂閱「使用者發來的文字訊息」事件；whitelist 過濾非綁定 chat 的訊息
    this.bot.on('message:text', (ctx) => {
      if (ctx.chat.id !== this.chatId) {
        log.debug(`[telegram] ignored message from chat ${ctx.chat.id}`)
        return
      }
      handler(ctx.message.text)
    })
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
