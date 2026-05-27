/**
 * 日誌輸出 port。application 只認這個介面；具體寫檔 / console 實作在 infrastructure，
 * 由 composition / entry 注入。
 */
export interface LogPort {
  debug(msg: string): void
  info(msg: string): void
  warn(msg: string): void
  error(msg: string, e?: unknown): void
}
