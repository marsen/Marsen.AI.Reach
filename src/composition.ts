/**
 * Composition Root —— 整個程式裡唯一允許 import adapter 的地方。
 * 其他模組只 import port（介面）型別的 instance 或共用常數。
 */

import { homedir } from 'os'
import { join } from 'path'
import type { CLIRunner } from './application/ports/CLIRunner.js'
import type { BotConnection } from './application/ports/BotConnection.js'
import { ClaudeRunner } from './infrastructure/cli/ClaudeRunner.js'
import { UnixSocketBotConnection } from './infrastructure/control/UnixSocketBotConnection.js'

// TODO: 未來抽換成環境變數或設定檔；先寫死避免預設值掩蓋未設定錯誤
const CLAUDE_BIN = 'claude'
export const SOCKET_PATH = join(homedir(), '.rai', 'bot2.sock')

export const cliRunner: CLIRunner = new ClaudeRunner(CLAUDE_BIN, process.pid)
export const botConnection: BotConnection = new UnixSocketBotConnection(SOCKET_PATH)
