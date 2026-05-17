export interface CLIRunner {
  /**
   * 一律新建 session（若有舊的會先 kill 重來）。失敗或超時時 throw。
   */
  start(workDir: string): Promise<void>

  /**
   * 既有 session 是否還活著（tmux session 存在 + CLI 進程在跑）。
   * Daemon 在處理 info 命令時呼叫，回給 client 判斷可否接續。
   */
  isAlive(): boolean
}
