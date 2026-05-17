/**
 * daemon-entry.ts — Bot daemon 進程的入口。
 *
 * 由 bot2 spawn 為 detached 子進程，常駐 listen socket。
 * 不是給使用者直接跑的。
 */
import { homedir } from 'os'
import { join } from 'path'
import { cliRunner } from '../composition.js'
import { Daemon } from '../application/Daemon.js'

const SOCKET_PATH = join(homedir(), '.rai', 'bot2.sock')
const daemon = new Daemon(SOCKET_PATH, cliRunner)

daemon.start()
console.log('[daemon] listening')

process.on('SIGINT', () => { daemon.close(); process.exit(0) })
process.on('SIGTERM', () => { daemon.close(); process.exit(0) })
