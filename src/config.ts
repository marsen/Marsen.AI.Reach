import 'dotenv/config'

export const BOT_TOKEN = process.env.BOT_TOKEN!
export const ALLOWED_USER_ID = Number(process.env.ALLOWED_USER_ID!)
export const WORK_DIR = process.env.WORK_DIR ?? process.cwd()
export const CLAUDE_BIN = process.env.CLAUDE_BIN ?? '/usr/local/bin/claude'
