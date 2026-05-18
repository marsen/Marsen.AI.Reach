/**
 * Port: 啟動一個長壽互動式 CLI session 的契約。
 */
export interface CLIRunner {
  /**
   * 啟動 CLI
   */
  start(workDir: string): Promise<void>

  /**
   * 檢查是否活著
   */
  isAlive(): boolean
}
