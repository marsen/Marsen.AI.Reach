import type { ChatPort } from '../ports/ChatPort.js'
import type { CLIPaneIO } from '../ports/CLIPaneIO.js'
import type { LogPort } from '../ports/LogPort.js'

/**
 * ConversationMirror —— 線性 chat ↔ Claude CLI 雙向 relay。
 *
 * 行為：
 *   - chat 端收到使用者訊息 → 灌進 Claude CLI（host 端 tmux 內也會看到）
 *   - Claude CLI 有新輸出 → push 回 chat（host 端 tmux 內已直接看到）
 *
 * 純 application 邏輯，只依賴 port，無 I/O。
 *
 * 邏輯歸屬（2026-05-23 討論）：
 *   - 雙向搬訊息 + 「剝 user 行避免回響」決策：chat 平台無關，
 *     任何實作 ChatPort 的線性 chat（Telegram / LINE / 線性 Discord…）都適用
 *   - `❯ ` 偵測（stripUserIfFromChat 內）：Claude CLI 規格滲漏，
 *     未來理想做法是讓 CLIPaneIO emit 結構化 exchange，Mirror 不認 prompt 符號
 *
 * → Mirror 內沒有 Telegram-specific 邏輯，不合進 TelegramBot。
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

  // 若 exchange 的 user 行就是最近從 chat forward 過去的問題 → 剝掉 user 行只回 response。
  // 否則（host 來源 / 沒比中）回整段，chat 才看得到 host 端打的問題上下文。
  //
  // 剝決策本身 [Generic]：解的是「線性 chat 會顯示使用者自己送的訊息」這個 chat 通用特性。
  // `❯ ` 偵測 [CLI-specific]：Claude CLI prompt 符號，跟 chat 平台無關但跟 CLI 實作綁定，
  // 未來換 CLI 或 CLIPaneIO 重構成結構化 emit 時這段會搬走。
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
