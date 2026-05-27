/**
 * Port: 啟動一個長壽互動式 CLI session 的契約。
 */
export interface CLIRunner {
  /** session 識別字串（由 adapter 決定具體格式，如 tmux session 名） */
  readonly sessionName: string

  /**
   * 啟動 CLI
   */
  start(workDir: string): Promise<void>

  /**
   * 檢查是否活著
   */
  isAlive(): boolean
}
