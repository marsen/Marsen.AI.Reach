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
// TelegramBot 自己讀 env（透過 env-bootstrap 預載 ~/.rai/.env），composition 不認 token/chatId
export const bot: ChatPort = new TelegramBot()
