/**
 * 設定讀取 port。application 與 adapter 都只認這個介面，靠 entry 注入具體實作。
 * 用 key 取 value，讀不到即 throw（fail-loud，禁預設值——避免「忘了設」靜默通過）。
 */
export interface ConfigPort {
  get(key: string): string
}

/** 設定 key 常數（避免 call site 出現 magic string）；值對應 .env 變數名。 */
export const CONFIG = {
  SocketPath: 'SOCKET_PATH',
  TelegramBotToken: 'TELEGRAM_BOT_TOKEN',
  TelegramUserId: 'TELEGRAM_USER_ID',
} as const
