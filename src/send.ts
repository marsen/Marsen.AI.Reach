/**
 * 發送通知到 Telegram（fire and forget）
 * 用法：tsx src/send.ts "訊息內容"
 */
import { Bot } from 'grammy'
import { BOT_TOKEN, ALLOWED_USER_ID } from './config.js'

const message = process.argv[2]
if (!message) {
  console.error('用法：tsx src/send.ts "訊息內容"')
  process.exit(1)
}

const bot = new Bot(BOT_TOKEN)
await bot.api.sendMessage(ALLOWED_USER_ID, message)
console.log('✅ 已送出')
process.exit(0)
