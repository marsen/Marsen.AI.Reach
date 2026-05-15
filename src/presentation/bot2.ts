/**
 * bot2.ts — 程式進入點（主服務）
 * 只聚焦：「建立 tmux session 並啟動 Claude」這個故事
 */

import { CLIRunner } from '../application/ports/CLIRunner.js'
import { ClaudeRunner } from '../infrastructure/cli/ClaudeRunner.js'

async function main() {
  const runner: CLIRunner = new ClaudeRunner(
    process.env.CLAUDE_BIN ?? 'claude',
    process.pid,
  )

  await runner.start(process.cwd())
  // 到這裡：CLI 已就緒
}

main()
