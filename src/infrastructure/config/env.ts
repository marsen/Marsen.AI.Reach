import { config } from 'dotenv'
import { join } from 'path'
import { homedir } from 'os'

config({ path: join(homedir(), '.rai', '.env') })

export const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET!
export const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN!
export const ALLOWED_USER_ID = process.env.ALLOWED_USER_ID!
export const CLAUDE_BIN = process.env.CLAUDE_BIN ?? '/usr/local/bin/claude'
export const PORT = Number(process.env.PORT ?? 3000)
