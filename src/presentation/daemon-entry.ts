/**
 * daemon-entry.ts — Bot daemon 進程的入口。
 *
 * 由 bot2 spawn 為 detached 子進程，常駐 listen socket。
 * 不是給使用者直接跑的。
 */
import { cliRunner } from '../composition.js'
import { Daemon } from '../application/Daemon.js'

const daemon = new Daemon(cliRunner)

daemon.start()
console.log('[daemon] listening')

process.on('SIGINT', () => { daemon.close(); process.exit(0) })
process.on('SIGTERM', () => { daemon.close(); process.exit(0) })
