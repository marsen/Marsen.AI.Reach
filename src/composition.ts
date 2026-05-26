/**
 * Composition Root —— port → adapter 裝配。
 * 由 entry 注入 ConfigPort，需要設定的 adapter 從中取值。
 */

import type { ConfigPort } from './application/ports/ConfigPort.js'
import type { CLIRunner } from './application/ports/CLIRunner.js'
import type { CLIPaneIO } from './application/ports/CLIPaneIO.js'
import type { ChatPort } from './application/ports/ChatPort.js'
import type { BotConnection } from './application/ports/BotConnection.js'
import { ClaudeRunner } from './infrastructure/cli/ClaudeRunner.js'
import { UnixSocketBotConnection } from './infrastructure/control/UnixSocketBotConnection.js'
import { TelegramBot } from './infrastructure/platforms/TelegramBot.js'

export interface Composition {
  cliRunner: CLIRunner
  cliPaneIO: CLIPaneIO
  botConnection: BotConnection
  bot: ChatPort
}

export function createComposition(config: ConfigPort): Composition {
  // ClaudeRunner 同時實作 CLIRunner + CLIPaneIO，同個 instance 綁兩個 port
  const tmuxClaude = new ClaudeRunner()
  return {
    cliRunner: tmuxClaude,
    cliPaneIO: tmuxClaude,
    botConnection: new UnixSocketBotConnection(config),
    bot: new TelegramBot(config),
  }
}
