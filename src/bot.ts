import { Bot } from 'grammy'
import { BOT_TOKEN, ALLOWED_USER_ID, WORK_DIR } from './config.js'
import { runClaude } from './claude-session.js'

const bot = new Bot(BOT_TOKEN)
let sessionActive = false
let isFirst = true

// 白名單
bot.use(async (ctx, next) => {
  if (ctx.from?.id !== ALLOWED_USER_ID) return
  await next()
})

bot.command('start', async (ctx) => {
  sessionActive = true
  isFirst = true
  await ctx.reply(`🚀 Session 啟動\n📁 ${WORK_DIR}\n\n傳訊息給 Claude 吧！`)
})

bot.command('stop', async (ctx) => {
  sessionActive = false
  isFirst = true
  await ctx.reply('🛑 Session 結束')
})

bot.command('status', async (ctx) => {
  await ctx.reply(sessionActive ? '✅ Session 進行中' : '💤 沒有 session')
})

bot.on('message:text', async (ctx) => {
  if (!sessionActive) {
    await ctx.reply('請先 /start')
    return
  }

  await ctx.reply('⏳ 思考中...')

  try {
    const reply = await runClaude(ctx.message.text, isFirst)
    isFirst = false
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

bot.start()
console.log('🤖 Marsen.AI.Reach 啟動中...')
console.log(`📁 工作目錄：${WORK_DIR}`)
