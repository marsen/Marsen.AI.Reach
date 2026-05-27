import type { ChatPort, CLIPaneIO, LogPort } from '@ports'

/**
 * ConversationMirror —— 線性 chat ↔ Claude CLI 雙向 relay。
 * 純 application 邏輯，只依賴 port，無 I/O。
 */
export class ConversationMirror {
  // 記最近一則「chat → Claude」的問題；下一次 Claude emit exchange 命中即剝掉 user 行
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

  private forwardToBot(text: string): void {
    this.log.info(`[mirror] Claude→chat: ${text.length} chars`)
    const payload = this.stripUserIfFromChat(text)
    if (!payload) return
    // bot.send 內部處理平台訊息上限分段，mirror 不關心
    void this.bot.send(payload).catch((e: unknown) => this.log.error('[mirror] bot.send failed', e))
  }

  // chat 來源的問題 → 剝掉 user 行只回 response；host 來源 → 回整段。
  // TODO: ❯ 偵測是 Claude CLI 規格滲漏；CLIPaneIO 改為結構化 emit 後移走
  private stripUserIfFromChat(exchange: string): string {
    if (this.lastChatInput === null) return exchange
    const lines = exchange.split('\n')
    const userIdx = lines.findIndex((l) => l.startsWith('❯ '))
    if (userIdx === -1) return exchange
    const userText = lines[userIdx].replace(/^❯\s+/, '').trim()
    if (userText !== this.lastChatInput.trim()) return exchange
    this.lastChatInput = null
    return lines.slice(userIdx + 1).join('\n').trim()
  }

}
