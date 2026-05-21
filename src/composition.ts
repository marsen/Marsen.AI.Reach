/**
 * Composition Root —— port → adapter mapping。
 * 環境設定常數請從 ./config.js 來。
 */

import type { CLIRunner } from './application/ports/CLIRunner.js'
import type { CLIPaneIO } from './application/ports/CLIPaneIO.js'
import type { ChatPort } from './application/ports/ChatPort.js'
import type { BotConnection } from './application/ports/BotConnection.js'
import { ClaudeRunner2 } from './infrastructure/cli/ClaudeRunner2.js'
import { UnixSocketBotConnection } from './infrastructure/control/UnixSocketBotConnection.js'
import { TelegramBot } from './infrastructure/platforms/TelegramBot.js'

// ClaudeRunner2 同時實作 CLIRunner + CLIPaneIO，同個 instance 綁兩個 port
const tmuxClaude = new ClaudeRunner2()

export const cliRunner: CLIRunner = tmuxClaude
export const cliPaneIO: CLIPaneIO = tmuxClaude
export const botConnection: BotConnection = new UnixSocketBotConnection()

// TelegramBot 需要 runtime 才知道的 token/chatId，提供 factory 讓 entry 在讀完 env 後呼叫
// TODO（待討論）：makeTelegramBot 名字綁定 Telegram → daemon-entry 也得 import 這個 Telegram-specific 名稱，
// 換 LINE 時要動兩處。理想 composition 對外只 export generic factory（如 `makeChat()`），
// 由 composition 內部根據 env (PLATFORM) 決定 adapter；env 怎麼讀也要一併設計。
export function makeTelegramBot(token: string, chatId: number): ChatPort {
  return new TelegramBot(token, chatId)
}
