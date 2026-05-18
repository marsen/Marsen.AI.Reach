/**
 * Client 端 port：向 Daemon 發送命令的契約。
 *
 * 與 Daemon 內部 dispatch 對應（info / start）。
 * 失敗（daemon 回 `error:<msg>`）時 throw。
 */
export interface BotConnection {
  info(): Promise<{ workDir: string | null; sessionAlive: boolean }>
  start(workDir: string): Promise<void>
}
