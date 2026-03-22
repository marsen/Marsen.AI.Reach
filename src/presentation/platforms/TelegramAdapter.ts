import express from 'express'
import { Bot } from 'grammy'
import { SessionLogger } from '../../infrastructure/logger/SessionLogger.js'
import type { AdapterDeps, PlatformAdapter } from './types.js'

export function createAdapter(deps: AdapterDeps): PlatformAdapter {
  const { startSession, stopSession, sendMessage, session, getWorkDir, getLogger, setLogger, ensureLogger, log } = deps

  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
  if (!BOT_TOKEN) throw new Error('PLATFORM=telegram 需要設定 TELEGRAM_BOT_TOKEN')
  const TELEGRAM_USER_ID = Number(process.env.TELEGRAM_USER_ID)
  if (!TELEGRAM_USER_ID) throw new Error('PLATFORM=telegram 需要設定 TELEGRAM_USER_ID')

  const bot = new Bot(BOT_TOKEN)

  async function push(text: string) {
    await bot.api.sendMessage(TELEGRAM_USER_ID, text).catch(() => {})
  }

  // 白名單
  bot.use(async (ctx, next) => {
    if (ctx.from?.id !== TELEGRAM_USER_ID) {
      log(`[bot] blocked: ${ctx.from?.id}`)
      return
    }
    await next()
  })

  bot.command('start', async (ctx) => {
    log(`[bot] /start`)
    await ctx.reply('⏳ 啟動中...')
    const workDir = getWorkDir()
    const result = await startSession.execute(workDir)
    ensureLogger(workDir)
    if (result === 'resumed') {
      await push(`🔄 接續對話\n📁 ${workDir}`)
    } else {
      await push(`🆕 新對話\n📁 ${workDir}\n\n傳訊息給 Claude 吧！`)
    }
  })

  bot.command('stop', async (ctx) => {
    stopSession.execute()
    setLogger(null)
    await ctx.reply('🛑 Session 結束')
  })

  bot.command('status', async (ctx) => {
    await ctx.reply(session.isActive() ? '✅ Session 進行中' : '💤 沒有 session')
  })

  bot.command('cleanup', async (ctx) => {
    const count = SessionLogger.cleanup(getWorkDir())
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
      getLogger()?.write('User', userMsg)
      const response = await sendMessage.execute(userMsg)
      getLogger()?.write('Claude', response)
      log(`[bot] reply length: ${response.length} preview: ${response.slice(0, 80)}`)

      for (let i = 0; i < response.length; i += 4000) {
        await ctx.reply(response.slice(i, i + 4000))
      }
    } catch (err) {
      log(`[bot] error: ${(err as Error).message}`)
      await push(`❌ 錯誤：${(err as Error).message}`)
    }
  })

  bot.catch((err) => {
    log(`[bot] grammy error: ${err.message}`)
  })

  // 啟動 Long Polling（非阻塞）
  bot.api.sendMessage(TELEGRAM_USER_ID, '⏳ Bot 啟動中，請稍候...').catch(() => {})
  bot.start({
    onStart: async (info) => {
      log(`[bot] polling started: @${info.username}`)
      await push('✅ Bot 已上線，可以開始對話')
    },
  }).catch(err => log(`[bot] grammy start error: ${(err as Error).message}`))

  // Telegram 用 Long Polling，不需要 HTTP server
  const router = express.Router()

  return { router, push, httpPort: null }
}
