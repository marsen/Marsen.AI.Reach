/**
 * Client 端 adapter：用 Unix Domain Socket 實作 BotConnection。
 * 每次呼叫開一條連線、送一行命令、收回應、關閉。
 */
import { createConnection } from 'net'
import type { BotConnection } from '../../application/ports/BotConnection.js'

export class UnixSocketBotConnection implements BotConnection {
  constructor(private readonly socketPath: string) {}

  async info(): Promise<{ workDir: string | null; sessionAlive: boolean }> {
    return JSON.parse(await this.send('info'))
  }

  async start(workDir: string): Promise<void> {
    const r = await this.send(`start:${workDir}`)
    if (r.startsWith('error:')) throw new Error(r.slice('error:'.length))
  }

  private send(cmd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const conn = createConnection(this.socketPath)
      let buf = ''
      conn.on('connect', () => conn.write(cmd + '\n'))
      conn.on('data', (data) => { buf += data.toString() })
      conn.on('end', () => resolve(buf.trim()))
      conn.on('error', reject)
    })
  }
}
