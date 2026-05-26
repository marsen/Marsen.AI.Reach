import { createServer, type Server, type Socket } from 'net'
import { rmSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import type { CLIRunner } from './ports/CLIRunner.js'
import { type ConfigPort, CONFIG } from './ports/ConfigPort.js'

/**
 * Bot daemon —— 接 Unix socket、分派命令給內部邏輯。
 *
 * 支援命令：
 *   info             → 回 JSON: { workDir, sessionAlive, sessionName }
 *   start:<workDir>  → 一律新建 session（kill 舊建新），回 ok / error:<msg>
 *
 * 協定假設：每連線送一個命令（< 1KB）、收完一個回應就關。
 *   - 命令短（目前 max ~50 bytes），不會被 UDS chunk 拆
 *   - 若未來命令攜帶大 payload，需改成行協定（buffer 累積到 '\n' 才 dispatch）
 */
export class Daemon {
  private server: Server | null = null
  private workDir: string | null = null

  private readonly socketPath: string

  constructor(
    private readonly cliRunner: CLIRunner,
    config: ConfigPort,
  ) {
    this.socketPath = config.get(CONFIG.SocketPath)
  }

  start(): void {
    mkdirSync(dirname(this.socketPath), { recursive: true })   // runtime 確保 socket 目錄存在（dev/prod 皆然）
    rmSync(this.socketPath, { force: true })
    this.server = createServer((conn) => {
      conn.on('error', () => {})   // client 中途斷線時避免 unhandled error
      conn.on('data', (data) => this.dispatch(data.toString().trim(), conn))
    })
    this.server.listen(this.socketPath)
  }

  close(): void {
    this.server?.close()
    this.server = null
    rmSync(this.socketPath, { force: true })
  }

  private dispatch(cmd: string, conn: Socket): void {
    if (cmd === 'info') {
      conn.end(JSON.stringify({
        workDir: this.workDir,
        sessionAlive: this.cliRunner.isAlive(),
        sessionName: this.cliRunner.sessionName
      }) + '\n')
      return
    }
    if (cmd.startsWith('start:')) {
      const dir = cmd.slice('start:'.length)
      this.cliRunner.start(dir)
        .then(() => { this.workDir = dir; conn.end('ok\n') })
        .catch((e: unknown) => conn.end(`error:${e instanceof Error ? e.message : String(e)}\n`))
      return
    }
    conn.end(`error:unknown command: ${cmd}\n`)
  }
}
