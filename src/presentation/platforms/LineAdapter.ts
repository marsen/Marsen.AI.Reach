import express from 'express'
import { middleware, Client, TextMessage } from '@line/bot-sdk'
import { LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, ALLOWED_USER_ID } from '../../infrastructure/config/env.js'
import { SessionLogger } from '../../infrastructure/logger/SessionLogger.js'
import type { AdapterDeps, PlatformAdapter } from './types.js'

export function createAdapter(deps: AdapterDeps): PlatformAdapter {
  const { startSession, stopSession, sendMessage, session, getWorkDir, getLogger, setLogger, ensureLogger, log } = deps

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

  const router = express.Router()

  router.post('/webhook', middleware({ channelSecret: LINE_CHANNEL_SECRET }), async (req, res) => {
    res.sendStatus(200)

    for (const event of req.body.events) {
      if (event.source.userId !== ALLOWED_USER_ID) {
        log(`[bot] blocked: ${event.source.userId}`)
        continue
      }

      if (event.type === 'message' && event.message.type === 'text') {
        const text: string = event.message.text
        const replyToken: string = event.replyToken
        const workDir = getWorkDir()

        if (text === '/start') {
          log(`[bot] /start`)
          await reply(replyToken, '⏳ 啟動中...')
          const result = await startSession.execute(workDir)
          ensureLogger(workDir)
          if (result === 'resumed') {
            await push(`🔄 接續對話\n📁 ${workDir}`)
          } else {
            await push(`🆕 新對話\n📁 ${workDir}\n\n傳訊息給 Claude 吧！`)
          }

        } else if (text === '/stop') {
          stopSession.execute()
          setLogger(null)
          await reply(replyToken, '🛑 Session 結束')

        } else if (text === '/status') {
          await reply(replyToken, session.isActive() ? '✅ Session 進行中' : '💤 沒有 session')

        } else if (text === '/cleanup') {
          const count = SessionLogger.cleanup(workDir)
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
            getLogger()?.write('User', text)
            const response = await sendMessage.execute(text)
            getLogger()?.write('Claude', response)
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

  return { router, push }
}
