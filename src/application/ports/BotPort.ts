/**
 * Port: 對話 bot 平台（Telegram / LINE / 自製 App）的抽象。
 *
 * application 層用此介面，不關心底層 SDK 或協定。
 */
export interface BotPort {
  /** 送一則訊息給使用者。 */
  send(text: string): Promise<void>

  /** 註冊 callback；使用者送來訊息時被呼叫。 */
  onMessage(handler: (text: string) => void): void

  /** 開始接收訊息（例如 polling 或 listen webhook）。 */
  start(): Promise<void>

  /** 停止接收。 */
  stop(): Promise<void>
}
