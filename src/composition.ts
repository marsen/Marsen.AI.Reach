/**
 * Composition Root —— port → adapter mapping。
 * 環境設定常數請從 ./config.js 來。
 */

import type { CLIRunner } from './application/ports/CLIRunner.js'
import type { ClaudePaneIO } from './application/ports/ClaudePaneIO.js'
import type { BotPort } from './application/ports/BotPort.js'
import type { BotConnection } from './application/ports/BotConnection.js'
import { ClaudeRunner2 } from './infrastructure/cli/ClaudeRunner2.js'
import { UnixSocketBotConnection } from './infrastructure/control/UnixSocketBotConnection.js'
import { TelegramBot } from './infrastructure/platforms/TelegramBot.js'

// ClaudeRunner2 同時實作 CLIRunner + ClaudePaneIO，同個 instance 綁兩個 port
const tmuxClaude = new ClaudeRunner2()

export const cliRunner: CLIRunner = tmuxClaude
export const claudePaneIO: ClaudePaneIO = tmuxClaude
export const botConnection: BotConnection = new UnixSocketBotConnection()

// TelegramBot 需要 runtime 才知道的 token/chatId，提供 factory 讓 entry 在讀完 env 後呼叫
export function makeTelegramBot(token: string, chatId: number): BotPort {
  return new TelegramBot(token, chatId)
}
