/**
 * Composition Root —— 整個程式裡唯一允許 import adapter 的地方。
 * 其他所有模組只 import port（介面）。
 */

import type { CLIRunner } from './application/ports/CLIRunner.js'
import { ClaudeRunner } from './infrastructure/cli/ClaudeRunner.js'

export function buildRunner(): CLIRunner {
  return new ClaudeRunner(
    process.env.CLAUDE_BIN ?? 'claude',
    process.pid,
  )
}
