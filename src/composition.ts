/**
 * Composition Root —— 整個程式裡唯一允許 import adapter 的地方。
 * 其他模組只 import port（介面）型別的 instance。
 */

import type { CLIRunner } from './application/ports/CLIRunner.js'
import { ClaudeRunner } from './infrastructure/cli/ClaudeRunner.js'

// TODO: 未來抽換成環境變數或設定檔；先寫死避免預設值掩蓋未設定錯誤
const CLAUDE_BIN = 'claude'

export const cliRunner: CLIRunner = new ClaudeRunner(CLAUDE_BIN, process.pid)
