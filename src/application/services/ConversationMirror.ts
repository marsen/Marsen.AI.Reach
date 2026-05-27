import type { ChatPort, CLIPaneIO, PaneExchange, LogPort } from '@ports'

/**
 * ConversationMirror —— 線性 chat ↔ Claude CLI 雙向 relay。
 * 純 application 邏輯，只依賴 port，無 I/O。
 */
export class ConversationMirror {
  // 記最近一則「chat → Claude」的問題；下一次 Claude emit exchange 的 user 命中時只回 response，
  // 避免 chat 端重複看到自己剛剛送出的問題。多輪 race 沒處理（使用者通常不會連發）。
  private lastChatInput: string | null = null

  constructor(
    private readonly bot: ChatPort,
    private readonly cliIO: CLIPaneIO,
    private readonly log: LogPort,
  ) {}

  async start(): Promise<void> {
    this.bot.onMessage((text) => this.forwardToClaude(text))
    this.cliIO.onMessage((text) => this.forwardToBot(text))
    await this.bot.start()
  }

  async stop(): Promise<void> {
    await this.bot.stop()
  }

  private forwardToClaude(text: string): void {
    this.log.info(`[mirror] chat→Claude: ${text.length} chars`)
    this.lastChatInput = text
    // bot 的 onMessage handler 簽名是 sync，這裡 fire-and-forget；失敗只記 log，不中斷 mirror
    this.cliIO.send(text).catch((e: unknown) => this.log.error('[mirror] send failed', e))
  }

  // chat 來源的問題（exchange.user 命中上一則 chat input）→ 只回 response，
  // 避免 chat 端重複看到自己剛送出的問題；host 來源（PC 端打字）→ 回原始整段。
  private forwardToBot(ex: PaneExchange): void {
    const fromChat = this.lastChatInput !== null && ex.user === this.lastChatInput.trim()
    if (fromChat) this.lastChatInput = null
    const payload = fromChat ? ex.response : ex.raw
    this.log.info(`[mirror] Claude→chat: ${payload.length} chars`)
    if (!payload) return
    // bot.send 內部處理平台訊息上限分段，mirror 不關心
    void this.bot.send(payload).catch((e: unknown) => this.log.error('[mirror] bot.send failed', e))
  }
}
