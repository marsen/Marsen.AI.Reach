/**
 * Port: 對運行中的 Claude session 互動（送輸入 + 訂閱輸出）。
 *
 * application 層使用此介面，不關心底層是 tmux、node-pty 或其他實作。
 */
export interface ClaudePaneIO {
  /** 把 text 送入 Claude（模擬使用者輸入）。 */
  sendInput(text: string): Promise<void>

  /** 註冊 callback；session 有新輸出時被呼叫，參數為新增的內容（不含已看過部分）。 */
  onOutput(handler: (text: string) => void): void
}
