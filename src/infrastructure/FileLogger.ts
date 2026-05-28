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
import { LEVELS, resolveLevel, type Level } from './logLevel'

const LOG_PATH = join(homedir(), '.rai', 'logs', 'daemon.log')

try { mkdirSync(dirname(LOG_PATH), { recursive: true }) } catch { /* 已存在或無權限：仍試著寫，失敗 fallback console */ }

// 進程啟動時解析一次；未設 / 非法值在此 throw（fail-loud），改值需重啟 daemon
const threshold = resolveLevel(process.env.LOG_LEVEL)

function write(level: Level, msg: string): void {
  if (LEVELS.indexOf(level) < LEVELS.indexOf(threshold)) return // 低於門檻：不寫檔也不輸出
  const line = `[${new Date().toISOString()}] [${level}] ${msg}`
  try { appendFileSync(LOG_PATH, line + '\n') } catch { /* 寫檔失敗也別中斷 */ }
  if (level === 'ERROR') console.error(line)
  else console.log(line)
}

export const log: LogPort = {
  debug: (msg: string): void => write('DEBUG', msg),
  info: (msg: string): void => write('INFO', msg),
  warn: (msg: string): void => write('WARN', msg),
  error: (msg: string, e?: unknown): void => {
    const detail = e instanceof Error ? `: ${e.message}` : e !== undefined ? `: ${String(e)}` : ''
    write('ERROR', msg + detail)
  },
}
