/**
 * Composition Root —— 整個程式裡唯一允許 import adapter 的地方。
 * 其他模組只 import port（介面）型別的 instance。
 * 環境設定值請從 ./config.js 來。
 */

import type { CLIRunner } from './application/ports/CLIRunner.js'
import type { BotConnection } from './application/ports/BotConnection.js'
import { ClaudeRunner } from './infrastructure/cli/ClaudeRunner.js'
import { UnixSocketBotConnection } from './infrastructure/control/UnixSocketBotConnection.js'
export const cliRunner: CLIRunner = new ClaudeRunner(process.pid)
export const botConnection: BotConnection = new UnixSocketBotConnection()
