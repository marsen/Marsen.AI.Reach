/**
 * daemon-entry.ts — Bot daemon 進程的入口。
 *
 * 由 bot2 spawn 為 detached 子進程，常駐 listen socket + 跑 TC mirror。
 * 不是給使用者直接跑的。
 */
import { config as dotenvConfig } from 'dotenv'
import { homedir } from 'os'
import { join } from 'path'

// 在所有 env 讀取之前載入 ~/.rai/.env
dotenvConfig({ path: join(homedir(), '.rai', '.env') })

import { cliRunner, claudePaneIO, makeTelegramBot } from '../composition.js'
import { Daemon } from '../application/Daemon.js'
import { ConversationMirror } from '../application/services/ConversationMirror.js'
import { log } from '../logger.js'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Environment variable ${name} not set`)
  return v
}

const bot = makeTelegramBot(
  requireEnv('TELEGRAM_BOT_TOKEN'),
  Number(requireEnv('TELEGRAM_USER_ID')),
)
const mirror = new ConversationMirror(bot, claudePaneIO)

const daemon = new Daemon(cliRunner)
daemon.start()
log.info('[daemon] socket listening')
await mirror.start()
log.info('[daemon] mirror started')

const shutdown = (): void => {
  void (async () => {
    try { await mirror.stop() } catch { /* ignore */ }
    daemon.close()
    process.exit(0)
  })()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
