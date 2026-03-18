import { appendFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { createServer } from 'net'
import { Bot } from 'grammy'
import { BOT_TOKEN, ALLOWED_USER_ID } from '../infrastructure/config/env.js'
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

const bot = new Bot(BOT_TOKEN)

// 白名單
bot.use(async (ctx, next) => {
  log(`[bot] from id: ${ctx.from?.id} allowed: ${ALLOWED_USER_ID}`)
  if (ctx.from?.id !== ALLOWED_USER_ID) {
    log('[bot] blocked')
    return
  }
  await next()
})

bot.command('start', async (ctx) => {
  log(`[bot] /start from ${ctx.from?.id}`)
  await ctx.reply('⏳ 啟動中...')
  const result = await startSession.execute(currentWorkDir)
  ensureLogger(currentWorkDir)
  console.log('[bot] session result:', result)
  if (result === 'resumed') {
    await ctx.reply(`🔄 接續對話\n📁 ${currentWorkDir}`)
  } else {
    await ctx.reply(`🆕 新對話\n📁 ${currentWorkDir}\n\n傳訊息給 Claude 吧！`)
  }
})

bot.command('stop', async (ctx) => {
  stopSession.execute()
  logger = null
  await ctx.reply('🛑 Session 結束')
})

bot.command('status', async (ctx) => {
  await ctx.reply(session.isActive() ? '✅ Session 進行中' : '💤 沒有 session')
})

bot.command('cleanup', async (ctx) => {
  const count = SessionLogger.cleanup(currentWorkDir)
  await ctx.reply(`🗑️ 已刪除 ${count} 筆 30 天前的 log`)
})

bot.on('message:text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return
  if (!session.isActive()) {
    await ctx.reply('請先 /start')
    return
  }

  await ctx.reply('⏳ 思考中...')

  try {
    const userMsg = ctx.message.text
    logger?.write('User', userMsg)

    const reply = await sendMessage.execute(userMsg)
    logger?.write('Claude', reply)
    console.log('[bot] reply length:', reply.length, 'preview:', reply.slice(0, 80))

    for (let i = 0; i < reply.length; i += 4000) {
      await ctx.reply(reply.slice(i, i + 4000))
      console.log('[bot] sent chunk', i)
    }
  } catch (err) {
    console.log('[bot] error:', err)
    await ctx.reply(`❌ 錯誤：${(err as Error).message}`)
  }
})

bot.catch(async (err) => {
  console.error('Bot error:', err.message)
})

// Unix socket server
const SOCKET_PATH = join(homedir(), '.ai-reach', 'bot.sock')

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
      if (cmd === 'status') {
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
  await bot.api.sendMessage(ALLOWED_USER_ID, '🔴 Bot 已離線').catch(() => {})
  process.exit(0)
})

process.on('SIGUSR1', async () => {
  stopSession.execute()
  await bot.api.sendMessage(ALLOWED_USER_ID, '💤 Claude session 已結束').catch(() => {})
  log('[bot] Claude exited, session stopped')
})

process.once('SIGTERM', async () => {
  cleanupSocket()
  await bot.api.sendMessage(ALLOWED_USER_ID, '🔴 Bot 已離線').catch(() => {})
  process.exit(0)
})

async function notifyAndExit(reason: string): Promise<never> {
  cleanupSocket()
  await bot.api.sendMessage(ALLOWED_USER_ID, `🔴 Bot 異常斷線：${reason}`).catch(() => {})
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

bot.api.sendMessage(ALLOWED_USER_ID, '⏳ Bot 啟動中，請稍候...').catch(() => {})
bot.start({
  onStart: async (info) => {
    log(`[bot] polling started: @${info.username}`)
    await bot.api.sendMessage(ALLOWED_USER_ID, '✅ Bot 已上線，可以開始對話')
  },
}).catch(err => notifyAndExit(err.message))
log('🤖 Marsen.AI.Reach 啟動中...')
