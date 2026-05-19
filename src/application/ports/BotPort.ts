/**
 * Port: TC 平台（Telegram / LINE / 自製 App）的抽象。
 *
 * application 層用此介面，不關心底層 SDK 或協定。
 */
export interface BotPort {
  /** 對 TC 端推送一則訊息（>4096 字由呼叫端負責分段）。 */
  push(text: string): Promise<void>

  /** 註冊 callback；TC 端收到使用者訊息時被呼叫。 */
  onMessage(handler: (text: string) => void): void

  /** 開始接收 TC 訊息（例如 polling 或 listen webhook）。 */
  start(): Promise<void>

  /** 停止接收。 */
  stop(): Promise<void>
}
