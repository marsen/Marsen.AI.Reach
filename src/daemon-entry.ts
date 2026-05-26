/**
 * daemon-entry.ts — Bot daemon 進程的入口。
 *
 * 由 bot spawn 為 detached 子進程，常駐 listen socket + 跑 chat mirror。
 * 不是給使用者直接跑的。
 */
import { createComposition } from './composition.js'
import { EnvConfig } from './infrastructure/EnvConfig.js'
import { Daemon } from './application/Daemon.js'
import { ConversationMirror } from './application/services/ConversationMirror.js'
import { log } from './infrastructure/logger.js'

// daemon 是 bot.ts spawn 的子進程，env 繼承自 bot.ts（已載 .env），此處不自行載 .env
const config = new EnvConfig()
const { cliRunner, cliPaneIO, botConnection, bot } = createComposition(config)

// 防呆：若已有 daemon 在跑就退出，避免兩個 daemon 競爭同一個 socket 檔
if (await botConnection.isAlive()) {
  log.info('[daemon] another instance is alive, exiting')
  process.exit(0)
}

const mirror = new ConversationMirror(bot, cliPaneIO, log)

const daemon = new Daemon(cliRunner, config)
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
