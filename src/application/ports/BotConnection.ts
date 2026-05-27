/**
 * Client 端 port：向 Daemon 發送命令的契約。
 *
 * 與 Daemon 內部 dispatch 對應（info / start）。
 * 失敗（daemon 回 `error:<msg>`）時 throw。
 */
export interface BotConnection {
  /** 純連線探測：能連上 socket 即 true（不送命令），用於判斷 daemon 是否在跑。 */
  isAlive(): Promise<boolean>

  info(): Promise<{ workDir: string | null; sessionAlive: boolean; sessionName: string }>
  start(workDir: string): Promise<void>
}
