/**
 * 全專案單一入口 logger（類似 config.ts 的位階）。
 *
 * - 同時寫檔（~/.rai/logs/daemon.log）與 console
 * - daemon 被 spawn 為 stdio:'ignore' 時，console 那邊看不到 → 看檔
 * - foreground 直接跑時 → console 跟檔同步
 * - 後續要換成 port/adapter 再升級，介面先固定
 */
import { appendFileSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'

const LOG_PATH = join(homedir(), '.rai', 'logs', 'daemon.log')

try { mkdirSync(dirname(LOG_PATH), { recursive: true }) } catch { /* 已存在或無權限：仍試著寫，失敗 fallback console */ }

type Level = 'DEBUG' | 'INFO' | 'ERROR'

function write(level: Level, msg: string): void {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}`
  try { appendFileSync(LOG_PATH, line + '\n') } catch { /* 寫檔失敗也別中斷 */ }
  if (level === 'ERROR') console.error(line)
  else console.log(line)
}

export const log = {
  debug: (msg: string): void => write('DEBUG', msg),
  info: (msg: string): void => write('INFO', msg),
  error: (msg: string, e?: unknown): void => {
    const detail = e instanceof Error ? `: ${e.message}` : e !== undefined ? `: ${String(e)}` : ''
    write('ERROR', msg + detail)
  },
}
