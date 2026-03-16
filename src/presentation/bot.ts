import { appendFileSync } from 'fs'
import { Bot } from 'grammy'
import { BOT_TOKEN, ALLOWED_USER_ID, WORK_DIR } from '../infrastructure/config/env.js'
import { Session } from '../domain/entities/Session.js'
import { TmuxClaudeAdapter } from '../infrastructure/claude/TmuxClaudeAdapter.js'
import { StartSessionUseCase } from '../application/use-cases/StartSessionUseCase.js'
import { StopSessionUseCase } from '../application/use-cases/StopSessionUseCase.js'
import { SendMessageUseCase } from '../application/use-cases/SendMessageUseCase.js'

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  process.stdout.write(line)
  appendFileSync('/tmp/bot-debug.log', line)
}

// 手動 wire
const session = new Session()
const claude = new TmuxClaudeAdapter()
const startSession = new StartSessionUseCase(claude, session)
const stopSession = new StopSessionUseCase(session)
const sendMessage = new SendMessageUseCase(claude, session)

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
  const result = await startSession.execute()
  console.log('[bot] session result:', result)
  if (result === 'resumed') {
    await ctx.reply(`🔄 接續對話\n📁 ${WORK_DIR}`)
  } else {
    await ctx.reply(`🆕 新對話\n📁 ${WORK_DIR}\n\n傳訊息給 Claude 吧！`)
  }
})

bot.command('stop', async (ctx) => {
  stopSession.execute()
  await ctx.reply('🛑 Session 結束')
})

bot.command('status', async (ctx) => {
  await ctx.reply(session.isActive() ? '✅ Session 進行中' : '💤 沒有 session')
})

bot.on('message:text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return
  if (!session.isActive()) {
    await ctx.reply('請先 /start')
    return
  }

  await ctx.reply('⏳ 思考中...')

  try {
    const reply = await sendMessage.execute(ctx.message.text)
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

process.once('SIGINT', async () => {
  await bot.api.sendMessage(ALLOWED_USER_ID, '🔴 Bot 已離線').catch(() => {})
  process.exit(0)
})

bot.api.sendMessage(ALLOWED_USER_ID, '⏳ Bot 啟動中，請稍候...').catch(() => {})
bot.start({
  onStart: async (info) => {
    log(`[bot] polling started: @${info.username}`)
    await bot.api.sendMessage(ALLOWED_USER_ID, '✅ Bot 已上線，可以開始對話')
  },
}).catch(err => log(`[bot] fatal: ${err.message}`))
log('🤖 Marsen.AI.Reach 啟動中...')
log(`📁 工作目錄：${WORK_DIR}`)
