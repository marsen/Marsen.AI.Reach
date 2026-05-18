import { createServer, type Server, type Socket } from 'net'
import { unlinkSync } from 'fs'
import type { CLIRunner } from './ports/CLIRunner.js'

/**
 * Bot daemon —— 接 Unix socket、分派命令給內部邏輯。
 *
 * 支援命令：
 *   info             → 回 JSON: { workDir, sessionAlive }
 *   start:<workDir>  → 一律新建 session（kill 舊建新），回 ok / error:<msg>
 */
export class Daemon {
  private server: Server | null = null
  private workDir: string | null = null

  constructor(
    private readonly socketPath: string,
    private readonly cliRunner: CLIRunner,
  ) {}

  start(): void {
    try { unlinkSync(this.socketPath) } catch {}
    this.server = createServer((conn) => {
      conn.on('error', () => {})   // client 中途斷線時避免 unhandled error
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
    if (cmd === 'info') {
      conn.end(JSON.stringify({
        workDir: this.workDir,
        sessionAlive: this.cliRunner.isAlive(),
      }) + '\n')
      return
    }
    if (cmd.startsWith('start:')) {
      const dir = cmd.slice('start:'.length)
      this.cliRunner.start(dir)
        .then(() => { this.workDir = dir; conn.end('ok\n') })
        .catch((e: Error) => conn.end(`error:${e.message}\n`))
      return
    }
    conn.end(`error:unknown command: ${cmd}\n`)
  }
}
