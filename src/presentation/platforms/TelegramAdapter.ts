import type { AdapterDeps, PlatformAdapter } from './types.js'

// TODO: 實作 Telegram adapter（grammY）
export function createAdapter(_deps: AdapterDeps): PlatformAdapter {
  throw new Error('TelegramAdapter 尚未實作，請先設定 PLATFORM=line')
}
