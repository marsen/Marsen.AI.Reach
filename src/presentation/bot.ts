import { appendFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { createServer } from 'net'
import express from 'express'
import { middleware, Client, TextMessage } from '@line/bot-sdk'
import { LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, ALLOWED_USER_ID, PORT } from '../infrastructure/config/env.js'
import { Session } from '../domain/entities/Session.js'
import { TmuxClaudeAdapter, setBotPid } from '../infrastructure/claude/TmuxClaudeAdapter.js'
import { StartSessionUseCase } from '../application/use-cases/StartSessionUseCase.js'
import { StopSessionUseCase } from '../application/use-cases/StopSessionUseCase.js'
import { SendMessageUseCase } from '../application/use-cases/SendMessageUseCase.js'
import { SessionLogger } from '../infrastructure/logger/SessionLogger.js'

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

// LINE client
const lineClient = new Client({
  channelSecret: LINE_CHANNEL_SECRET,
  channelAccessToken: LINE_CHANNEL_ACCESS_TOKEN,
})

async function reply(replyToken: string, text: string) {
  const msg: TextMessage = { type: 'text', text }
  await lineClient.replyMessage(replyToken, msg)
}

async function push(text: string) {
  const msg: TextMessage = { type: 'text', text }
  await lineClient.pushMessage(ALLOWED_USER_ID, msg).catch(() => {})
}

// Express + LINE Webhook
const app = express()

app.post('/webhook', middleware({ channelSecret: LINE_CHANNEL_SECRET }), async (req, res) => {
  res.sendStatus(200)

  for (const event of req.body.events) {
    if (event.source.userId !== ALLOWED_USER_ID) {
      log(`[bot] blocked: ${event.source.userId}`)
      continue
    }

    if (event.type === 'message' && event.message.type === 'text') {
      const text: string = event.message.text
      const replyToken: string = event.replyToken

      if (text === '/start') {
        log(`[bot] /start`)
        await reply(replyToken, '⏳ 啟動中...')
        const result = await startSession.execute(currentWorkDir)
        ensureLogger(currentWorkDir)
        if (result === 'resumed') {
          await push(`🔄 接續對話\n📁 ${currentWorkDir}`)
        } else {
          await push(`🆕 新對話\n📁 ${currentWorkDir}\n\n傳訊息給 Claude 吧！`)
        }

      } else if (text === '/stop') {
        stopSession.execute()
        logger = null
        await reply(replyToken, '🛑 Session 結束')

      } else if (text === '/status') {
        await reply(replyToken, session.isActive() ? '✅ Session 進行中' : '💤 沒有 session')

      } else if (text === '/cleanup') {
        const count = SessionLogger.cleanup(currentWorkDir)
        await reply(replyToken, `🗑️ 已刪除 ${count} 筆 30 天前的 log`)

      } else if (text.startsWith('/')) {
        // 忽略未知指令

      } else {
        if (!session.isActive()) {
          await reply(replyToken, '請先 /start')
          continue
        }

        await reply(replyToken, '⏳ 思考中...')

        try {
          logger?.write('User', text)
          const response = await sendMessage.execute(text)
          logger?.write('Claude', response)
          log(`[bot] reply length: ${response.length} preview: ${response.slice(0, 80)}`)

          for (let i = 0; i < response.length; i += 5000) {
            await push(response.slice(i, i + 5000))
          }
        } catch (err) {
          log(`[bot] error: ${(err as Error).message}`)
          await push(`❌ 錯誤：${(err as Error).message}`)
        }
      }
    }
  }
})

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
  await push('🔴 Bot 已離線')
  process.exit(0)
})

process.on('SIGUSR1', async () => {
  stopSession.execute()
  await push('💤 Claude session 已結束')
  log('[bot] Claude exited, session stopped')
})

process.once('SIGTERM', async () => {
  cleanupSocket()
  await push('🔴 Bot 已離線')
  process.exit(0)
})

async function notifyAndExit(reason: string): Promise<never> {
  cleanupSocket()
  await push(`🔴 Bot 異常斷線：${reason}`)
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
  push('✅ Bot 已上線，可以開始對話').catch(() => {})
})

log('🤖 Marsen.AI.Reach 啟動中...')
