/**
 * LogPort 的具體實作：同時寫檔（~/.rai/logs/daemon.log）與 console。
 *
 * - daemon 被 spawn 為 stdio:'ignore' 時，console 那邊看不到 → 看檔
 * - foreground 直接跑時 → console 跟檔同步
 *
 * entry / composition root 直接 import `log` 單例後注入給 adapter；所有 adapter 走 LogPort 建構子注入。
 */
import { appendFileSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import type { LogPort } from '@ports'

const LOG_PATH = join(homedir(), '.rai', 'logs', 'daemon.log')

try { mkdirSync(dirname(LOG_PATH), { recursive: true }) } catch { /* 已存在或無權限：仍試著寫，失敗 fallback console */ }

type Level = 'DEBUG' | 'INFO' | 'ERROR'

function write(level: Level, msg: string): void {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}`
  try { appendFileSync(LOG_PATH, line + '\n') } catch { /* 寫檔失敗也別中斷 */ }
  if (level === 'ERROR') console.error(line)
  else console.log(line)
}

export const log: LogPort = {
  debug: (msg: string): void => write('DEBUG', msg),
  info: (msg: string): void => write('INFO', msg),
  error: (msg: string, e?: unknown): void => {
    const detail = e instanceof Error ? `: ${e.message}` : e !== undefined ? `: ${String(e)}` : ''
    write('ERROR', msg + detail)
  },
}
