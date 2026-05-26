/**
 * TelegramBot —— ChatPort 的 Telegram 實作（grammY 包裝）。
 *
 * 用 long-polling，本機/不開 webhook 即可跑。
 * 單一使用者：所有訊息只送 / 收綁定的 chatId（從 env 讀）。
 */
import { Bot } from 'grammy'
import { type ChatPort, type ConfigPort, type LogPort, CONFIG } from '@ports'

export class TelegramBot implements ChatPort {
  // Telegram 單則訊息字元上限；超過 API 會拒絕，send 內自動分段
  private static readonly MAX_MESSAGE_LEN = 4096

  private readonly bot: Bot
  private readonly chatId: number

  constructor(config: ConfigPort, private readonly log: LogPort) {
    // config.get 讀不到即 throw（fail-loud），不需再各別檢查
    this.chatId = Number(config.get(CONFIG.TelegramUserId))
    this.bot = new Bot(config.get(CONFIG.TelegramBotToken))
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
        this.log.debug(`[telegram] ignored message from chat ${ctx.chat.id}`)
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
      .catch((e) => this.log.error('[telegram] polling failed', e))
  }

  async stop(): Promise<void> {
    await this.bot.stop()
  }
}
