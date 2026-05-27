/**
 * Composition Root —— port → adapter 裝配。
 * 由 entry 注入 ConfigPort，需要設定的 adapter 從中取值。
 */

import type { ConfigPort, CLIRunner, CLIPaneIO, ChatPort, BotConnection, LogPort } from '@ports'
import { ClaudeRunner } from './cli/ClaudeRunner'
import { UnixSocketBotConnection } from './control/UnixSocketBotConnection'
import { TelegramBot } from './platforms/TelegramBot'
import { log } from './FileLogger'

export interface Composition {
  cliRunner: CLIRunner
  cliPaneIO: CLIPaneIO
  botConnection: BotConnection
  bot: ChatPort
  log: LogPort
}

export function createComposition(config: ConfigPort): Composition {
  // ClaudeRunner 同時實作 CLIRunner + CLIPaneIO，同個 instance 綁兩個 port
  const tmuxClaude = new ClaudeRunner(log)
  return {
    cliRunner: tmuxClaude,
    cliPaneIO: tmuxClaude,
    botConnection: new UnixSocketBotConnection(config),
    bot: new TelegramBot(config, log),
    log,
  }
}
