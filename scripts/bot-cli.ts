/**
 * 簡易測試工具：interactive 送命令給 bot daemon、印回應。
 * 使用：npx tsx scripts/bot-cli.ts
 */
import { createConnection } from 'net'
import { homedir } from 'os'
import { join } from 'path'
import process from 'process'
import readline from 'readline'

const SOCKET = join(homedir(), '.rai', 'bot.sock')

function send(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const c = createConnection(SOCKET)
    let buf = ''
    c.on('connect', () => c.write(cmd + '\n'))
    c.on('data', (d) => { buf += d.toString() })
    c.on('end', () => resolve(buf.trim()))
    c.on('error', reject)
  })
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
console.log(`bot-cli ─ 連 ${SOCKET}`)
console.log('輸入命令送出，例如：info、start:/tmp（Ctrl+C 結束）')
rl.setPrompt('→ ')
rl.prompt()

rl.on('line', async (line) => {
  const cmd = line.trim()
  if (!cmd) { rl.prompt(); return }
  try {
    const r = await send(cmd)
    console.log('←', r)
  } catch (e) {
    console.error('error:', (e as Error).message)
  }
  rl.prompt()
})

rl.on('close', () => process.exit(0))
