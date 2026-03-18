#!/usr/bin/env node
import { createInterface } from 'readline'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { execSync } from 'child_process'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { fileURLToPath } from 'url'

const PACKAGE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

const CONFIG_DIR = join(homedir(), '.rai')
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

console.log('🤖 rai 設定精靈\n')

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

// Install launchd service
const LAUNCHD_LABEL = 'com.marsen.rai'
const PLIST_DIR = join(homedir(), 'Library', 'LaunchAgents')
const PLIST_PATH = join(PLIST_DIR, `${LAUNCHD_LABEL}.plist`)
const TSX = join(PACKAGE_DIR, 'node_modules', '.bin', 'tsx')
const BOT_TS = join(PACKAGE_DIR, 'src', 'presentation', 'bot.ts')
const LOG_PATH = join(CONFIG_DIR, 'bot.log')
const NODE_BIN_DIR = dirname(process.execPath)

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${TSX}</string>
    <string>${BOT_TS}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${homedir()}</string>
    <key>PATH</key>
    <string>${NODE_BIN_DIR}:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${LOG_PATH}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_PATH}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
`

mkdirSync(PLIST_DIR, { recursive: true })
writeFileSync(PLIST_PATH, plist)

try {
  execSync(`launchctl unload "${PLIST_PATH}" 2>/dev/null; launchctl load "${PLIST_PATH}"`)
  console.log(`✅ 服務已安裝，開機自動啟動（${LAUNCHD_LABEL}）`)
} catch {
  console.log(`⚠️  服務安裝完成，但啟動失敗，請手動執行：`)
  console.log(`   launchctl load "${PLIST_PATH}"`)
}
