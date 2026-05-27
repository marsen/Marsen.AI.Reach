/**
 * Port: 對運行中的互動式 CLI session 通訊（送輸入 + 訂閱輸出）。
 *
 * application 層使用此介面，不關心底層是哪支 CLI（claude / gemini / codex）
 * 或承載方式（tmux、node-pty 等）。
 */
export interface CLIPaneIO {
  /** 把 text 送入 CLI（模擬使用者輸入）。 */
  send(text: string): Promise<void>

  /** 註冊 callback；session 有新輸出時被呼叫，參數為新增的內容（不含已看過部分）。 */
  onMessage(handler: (text: string) => void): void
}
