/**
 * Client 端 adapter：用 Unix Domain Socket 實作 BotConnection。
 * 每次呼叫開一條連線、送一行命令、收回應、關閉。
 */
import { createConnection } from 'net'
import { text } from 'stream/consumers'
import { SOCKET_PATH } from '../config.js'
import type { BotConnection } from '../../application/ports/BotConnection.js'

export class UnixSocketBotConnection implements BotConnection {
  constructor() {}

  isAlive(): Promise<boolean> {
    return new Promise((resolve) => {
      const conn = createConnection(SOCKET_PATH)
      conn.once('connect', () => { conn.end(); resolve(true) })
      conn.once('error', () => resolve(false))
    })
  }

  async info(): Promise<{ workDir: string | null; sessionAlive: boolean; sessionName: string }> {
    return JSON.parse(await this.send('info'))
  }

  async start(workDir: string): Promise<void> {
    const r = await this.send(`start:${workDir}`)
    if (r.startsWith('error:')) throw new Error(r.slice('error:'.length))
  }

  private async send(cmd: string): Promise<string> {
    const conn = createConnection(SOCKET_PATH)
    conn.write(cmd + '\n')
    // text() 把整條 socket stream 收成字串；daemon 寫完回應 conn.end() 後才 resolve
    return (await text(conn)).trim()
  }
}
