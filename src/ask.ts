/**
 * 發問並等待回覆（阻塞直到用戶回答）
 * 用法：tsx src/ask.ts "問題內容"
 * 回傳：用戶的回覆文字（stdout）
 */
import { Bot } from 'grammy'
import { BOT_TOKEN, ALLOWED_USER_ID } from './config.js'
import { clearReply, readReply, ensureQueueDir } from './queue.js'

const question = process.argv[2]
if (!question) {
  console.error('用法：tsx src/ask.ts "問題內容"')
  process.exit(1)
}

ensureQueueDir()
clearReply()

const bot = new Bot(BOT_TOKEN)
await bot.api.sendMessage(ALLOWED_USER_ID, `❓ ${question}`)

// 輪詢等待回覆（最多 10 分鐘）
const TIMEOUT = 10 * 60 * 1000
const INTERVAL = 1000
const start = Date.now()

while (Date.now() - start < TIMEOUT) {
  const reply = readReply()
  if (reply && reply.at > start) {
    process.stdout.write(reply.reply)
    process.exit(0)
  }
  await new Promise((r) => setTimeout(r, INTERVAL))
}

console.error('⏰ 等待逾時（10 分鐘）')
process.exit(1)
