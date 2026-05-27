/**
 * Composition Root —— 輕量 DI container。
 * entry point 按需取用 adapter，只建實際用到的 instance。
 */

import type { ConfigPort, CLIRunner, CLIPaneIO, ChatPort, BotConnection, LogPort } from '@ports'
import { ClaudeRunner } from './cli/ClaudeRunner'
import { UnixSocketBotConnection } from './control/UnixSocketBotConnection'
import { TelegramBot } from './platforms/TelegramBot'
import { log } from './FileLogger'
import { Daemon } from '../application/Daemon'
import { ConversationMirror } from '../application/services/ConversationMirror'

export class Container {
  private _tmuxClaude?: ClaudeRunner
  private _botConnection?: BotConnection
  private _bot?: ChatPort
  private _daemon?: Daemon
  private _mirror?: ConversationMirror

  constructor(private readonly config: ConfigPort) {}

  // ClaudeRunner 同時實作 CLIRunner 與 CLIPaneIO，
  // 兩個 getter 把同一個 instance 以不同介面暴露，各自的使用者只看到它需要的那塊。
  get cliRunner(): CLIRunner { return this.tmuxClaude }
  get cliPaneIO(): CLIPaneIO { return this.tmuxClaude }

  get botConnection(): BotConnection {
    return this._botConnection ??= new UnixSocketBotConnection(this.config)
  }

  get bot(): ChatPort {
    return this._bot ??= new TelegramBot(this.config, log)
  }

  get log(): LogPort {
    return log
  }

  get daemon(): Daemon {
    return this._daemon ??= new Daemon(this.cliRunner, this.config)
  }

  get mirror(): ConversationMirror {
    return this._mirror ??= new ConversationMirror(this.bot, this.cliPaneIO, this.log)
  }

  private get tmuxClaude(): ClaudeRunner {
    return this._tmuxClaude ??= new ClaudeRunner(log)
  }
}
