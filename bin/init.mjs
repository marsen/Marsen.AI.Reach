#!/usr/bin/env node
import { createInterface } from 'readline'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const CONFIG_DIR = join(homedir(), '.ai-reach')
const ENV_FILE = join(CONFIG_DIR, '.env')

const rl = createInterface({ input: process.stdin, output: process.stdout })
const ask = (q) => new Promise(resolve => rl.question(q, resolve))

// Load existing values
let existing = {}
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, 'utf-8').split('\n')) {
    const idx = line.indexOf('=')
    if (idx === -1) continue
    const k = line.slice(0, idx).trim()
    const v = line.slice(idx + 1).trim()
    if (k) existing[k] = v
  }
}

console.log('🤖 ai-reach 設定精靈\n')

const botToken = await ask(
  `BOT_TOKEN${existing.BOT_TOKEN ? ` [現有: ${existing.BOT_TOKEN.slice(0, 10)}...]` : ''}: `
)
const allowedUserId = await ask(
  `ALLOWED_USER_ID${existing.ALLOWED_USER_ID ? ` [${existing.ALLOWED_USER_ID}]` : ''}: `
)
const claudeBin = await ask(
  `CLAUDE_BIN [${existing.CLAUDE_BIN || '/usr/local/bin/claude'}]: `
)

rl.close()

const values = {
  BOT_TOKEN: botToken.trim() || existing.BOT_TOKEN,
  ALLOWED_USER_ID: allowedUserId.trim() || existing.ALLOWED_USER_ID,
  CLAUDE_BIN: claudeBin.trim() || existing.CLAUDE_BIN || '/usr/local/bin/claude',
}

mkdirSync(CONFIG_DIR, { recursive: true })
writeFileSync(
  ENV_FILE,
  Object.entries(values).map(([k, v]) => `${k}=${v}`).join('\n') + '\n'
)

console.log(`\n✅ 設定完成，存至 ${ENV_FILE}`)
