/**
 * Port: 對運行中的互動式 CLI session 通訊（送輸入 + 訂閱輸出）。
 *
 * application 層使用此介面，不關心底層是哪支 CLI（claude / gemini / codex）
 * 或承載方式（tmux、node-pty 等）。
 */
/**
 * 一輪對話的結構化結果。由 adapter 負責從原始輸出解析，
 * application 層不需認識任何 CLI 的畫面規格（如提示符號）。
 */
export interface PaneExchange {
  /** 使用者送出的訊息（已去除 CLI 提示符號與前後空白）。 */
  user: string
  /** CLI（如 Claude）的回覆。 */
  response: string
  /** 原始整段（含提示符號與排版），供需要原樣呈現的情境使用。 */
  raw: string
}

export interface CLIPaneIO {
  /** 把 text 送入 CLI（模擬使用者輸入）。 */
  send(text: string): Promise<void>

  /** 註冊 callback；session 有新一輪對話時被呼叫，參數為解析好的 exchange。 */
  onMessage(handler: (exchange: PaneExchange) => void): void
}
