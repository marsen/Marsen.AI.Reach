import { appendFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { createServer } from 'net'
import express from 'express'
import { PORT } from '../infrastructure/config/env.js'
import { Session } from '../domain/entities/Session.js'
import { TmuxClaudeAdapter, setBotPid } from '../infrastructure/claude/TmuxClaudeAdapter.js'
import { StartSessionUseCase } from '../application/use-cases/StartSessionUseCase.js'
import { StopSessionUseCase } from '../application/use-cases/StopSessionUseCase.js'
import { SendMessageUseCase } from '../application/use-cases/SendMessageUseCase.js'
import { SessionLogger } from '../infrastructure/logger/SessionLogger.js'
import type { AdapterDeps, PlatformAdapter } from './platforms/types.js'

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  process.stdout.write(line)
  appendFileSync('/tmp/bot-debug.log', line)
}

// 手動 wire
setBotPid(process.pid)
const session = new Session()
const claude = new TmuxClaudeAdapter()
const startSession = new StartSessionUseCase(claude, session)
const stopSession = new StopSessionUseCase(session)
const sendMessage = new SendMessageUseCase(claude, session)

let logger: SessionLogger | null = null
let currentWorkDir = process.cwd()

function ensureLogger(workDir: string) {
  if (!logger) logger = new SessionLogger(workDir)
}

// 載入 platform adapter（PLATFORM=line|telegram，預設 line）
const platform = process.env.PLATFORM ?? 'line'
const { createAdapter } = await import(`./platforms/${platform}Adapter.js`) as { createAdapter: (deps: AdapterDeps) => PlatformAdapter }

const adapter = createAdapter({
  startSession,
  stopSession,
  sendMessage,
  session,
  getWorkDir: () => currentWorkDir,
  getLogger: () => logger,
  setLogger: (l) => { logger = l },
  ensureLogger,
  log,
})

log(`[bot] platform: ${platform}`)

// Express
const app = express()
app.use(adapter.router)

// Unix socket server
const SOCKET_PATH = join(homedir(), '.rai', 'bot.sock')

function cleanupSocket() {
  try { unlinkSync(SOCKET_PATH) } catch {}
}

cleanupSocket()

const socketServer = createServer((socket) => {
  let buf = ''
  socket.on('data', (data) => {
    buf += data.toString()
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      const cmd = line.trim()
      if (!cmd) continue
      if (cmd === 'info') {
        const info = JSON.stringify({ session: session.isActive() ? 'active' : 'inactive', workDir: currentWorkDir })
        socket.write(info + '\n')
        socket.end()
      } else if (cmd === 'status') {
        socket.write(session.isActive() ? 'active\n' : 'inactive\n')
        socket.end()
      } else if (cmd.startsWith('start')) {
        const workDir = cmd.includes(':') ? cmd.slice(cmd.indexOf(':') + 1) : currentWorkDir
        currentWorkDir = workDir
        startSession.execute(workDir).then(result => {
          ensureLogger(workDir)
          socket.write(`ready:${result}\n`)
          socket.end()
          log(`[bot] socket start: ${result} workDir: ${workDir}`)
        }).catch(err => {
          socket.write(`error:${(err as Error).message}\n`)
          socket.end()
        })
      }
    }
  })
  socket.on('error', () => {})
})

socketServer.listen(SOCKET_PATH, () => {
  log('[bot] socket listening')
})

// Signal handlers
process.once('SIGINT', async () => {
  cleanupSocket()
  await adapter.push('🔴 Bot 已離線')
  process.exit(0)
})

process.on('SIGUSR1', async () => {
  stopSession.execute()
  await adapter.push('💤 Claude session 已結束')
  log('[bot] Claude exited, session stopped')
})

process.once('SIGTERM', async () => {
  cleanupSocket()
  await adapter.push('🔴 Bot 已離線')
  process.exit(0)
})

async function notifyAndExit(reason: string): Promise<never> {
  cleanupSocket()
  await adapter.push(`🔴 Bot 異常斷線：${reason}`)
  process.exit(1)
}

process.on('uncaughtException', (err) => {
  log(`[bot] uncaughtException: ${err.message}`)
  notifyAndExit(err.message)
})

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason)
  log(`[bot] unhandledRejection: ${msg}`)
  notifyAndExit(msg)
})

// 啟動 HTTP server
app.listen(PORT, () => {
  log(`[bot] webhook listening on port ${PORT}`)
  adapter.push('✅ Bot 已上線，可以開始對話').catch(() => {})
})

log('🤖 Marsen.AI.Reach 啟動中...')
