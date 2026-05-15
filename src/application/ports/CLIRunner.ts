export interface CLIRunner {
  /**
   * 啟動 CLI 並等待就緒。失敗或超時時 throw。
   */
  start(workDir: string): Promise<void>
}
