import { config } from 'dotenv'
import { join } from 'path'
import { homedir } from 'os'

config({ path: join(homedir(), '.ai-reach', '.env') })

export const BOT_TOKEN = process.env.BOT_TOKEN!
export const ALLOWED_USER_ID = Number(process.env.ALLOWED_USER_ID!)
export const CLAUDE_BIN = process.env.CLAUDE_BIN ?? '/usr/local/bin/claude'
