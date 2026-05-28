/**
 * daemon-entry.ts — Bot daemon 進程的入口。
 *
 * 由 bot spawn 為 detached 子進程，常駐 listen socket + 跑 chat mirror。
 * 不是給使用者直接跑的。
 */
import { Container } from './infrastructure/composition'
import { EnvConfig } from './infrastructure/EnvConfig'

// daemon 是 bot.ts spawn 的子進程，env 繼承自 bot.ts（已載 .env），此處不自行載 .env
const config = new EnvConfig()
const c = new Container(config)

// 防呆：若已有 daemon 在跑就退出，避免兩個 daemon 競爭同一個 socket 檔
if (await c.botConnection.isAlive()) {
  c.log.warn('[daemon] another instance is alive, exiting')
  process.exit(0)
}

c.daemon.start()
c.log.info('[daemon] socket listening')
await c.mirror.start()
c.log.info('[daemon] mirror started')

// grammy bot.stop() 會等當前 long-polling getUpdates 收尾，最長卡到 polling timeout，
// 期間 process.exit(0) 走不到，導致 SIGTERM 殺不掉 daemon（要 kill -9）。
// 加 deadline：清理逾時就強制退出，讓 SIGTERM 能正常終結進程。
const SHUTDOWN_DEADLINE_MS = 3000
const shutdown = (): void => {
  const force = setTimeout(() => {
    c.log.warn('[daemon] shutdown timed out, forcing exit')
    process.exit(0)
  }, SHUTDOWN_DEADLINE_MS)
  force.unref()
  void (async () => {
    try { await c.mirror.stop() } catch { /* ignore */ }
    c.daemon.close()
    process.exit(0)
  })()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
