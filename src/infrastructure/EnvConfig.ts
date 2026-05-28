import { homedir } from 'os'
import { join } from 'path'
import type { ConfigPort } from '@ports'

/**
 * ConfigPort 的具體實作：從 process.env 讀。
 *
 * .env 檔由唯一起點 bot.ts 的 `import 'dotenv/config'` 載入；daemon 是 bot.ts spawn 的
 * 子進程，繼承 bot.ts 的 env，不自行載 .env。兩進程的 EnvConfig 都只讀 process.env，
 * 而那份 env 的源頭唯一是 bot.ts。
 */
export class EnvConfig implements ConfigPort {
  get(key: string): string {
    const v = process.env[key]
    if (!v) throw new Error(`config "${key}" 未設定（檢查 .env）`)
    // ~/ 展開成 home：讓 SOCKET_PATH 用跟 cwd 無關的固定位置
    return v.startsWith('~/') ? join(homedir(), v.slice(2)) : v
  }
}
