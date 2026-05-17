import { createServer, type Server, type Socket } from 'net'
import { unlinkSync } from 'fs'
import type { CLIRunner } from './ports/CLIRunner.js'

/**
 * Bot daemon —— 接 Unix socket、分派命令給內部邏輯。
 *
 * dispatch 內目前僅占位（echo），info / start 命令邏輯待之後從 bot.ts 抄入。
 */
export class Daemon {
  private server: Server | null = null

  constructor(
    private readonly socketPath: string,
    private readonly cliRunner: CLIRunner,
  ) {}

  start(): void {
    try { unlinkSync(this.socketPath) } catch {}
    this.server = createServer((conn) => {
      conn.on('data', (data) => this.dispatch(data.toString().trim(), conn))
    })
    this.server.listen(this.socketPath)
  }

  close(): void {
    this.server?.close()
    this.server = null
    try { unlinkSync(this.socketPath) } catch {}
  }

  private dispatch(cmd: string, conn: Socket): void {
    // TODO: 命令判讀（info / start）之後從 bot.ts 抄入
    // 暫時 echo 收到的命令；cliRunner 預留待之後使用
    void this.cliRunner
    conn.end(`echo:${cmd}\n`)
  }
}
