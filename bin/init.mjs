#!/usr/bin/env node
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { execSync } from 'child_process'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { fileURLToPath } from 'url'
import { select, input, password } from '@inquirer/prompts'

const PACKAGE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

const CONFIG_DIR = join(homedir(), '.rai')
const ENV_FILE = join(CONFIG_DIR, '.env')

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

const platform = await select({
  message: '選擇平台',
  choices: [
    { value: 'line', name: 'LINE Messaging API（Webhook）' },
    { value: 'telegram', name: 'Telegram（Long Polling）' },
  ],
  default: existing.PLATFORM ?? 'line',
})

let platformValues = {}
if (platform === 'telegram') {
  const botToken = await password({
    message: 'BOT_TOKEN',
    default: existing.BOT_TOKEN,
    mask: true,
  })
  const telegramUserId = await input({
    message: 'TELEGRAM_USER_ID',
    default: existing.TELEGRAM_USER_ID,
  })
  platformValues = {
    BOT_TOKEN: botToken || existing.BOT_TOKEN,
    TELEGRAM_USER_ID: telegramUserId || existing.TELEGRAM_USER_ID,
  }
} else {
  const channelSecret = await password({
    message: 'LINE_CHANNEL_SECRET',
    default: existing.LINE_CHANNEL_SECRET,
    mask: true,
  })
  const channelToken = await password({
    message: 'LINE_CHANNEL_ACCESS_TOKEN',
    default: existing.LINE_CHANNEL_ACCESS_TOKEN,
    mask: true,
  })
  const allowedUserId = await input({
    message: 'ALLOWED_USER_ID (LINE userId)',
    default: existing.ALLOWED_USER_ID,
  })
  const port = await input({
    message: 'PORT（Webhook 監聽埠）',
    default: existing.PORT ?? '57429',
    validate: (v) => /^\d+$/.test(v) ? true : '請輸入數字',
  })
  platformValues = {
    LINE_CHANNEL_SECRET: channelSecret || existing.LINE_CHANNEL_SECRET,
    LINE_CHANNEL_ACCESS_TOKEN: channelToken || existing.LINE_CHANNEL_ACCESS_TOKEN,
    ALLOWED_USER_ID: allowedUserId || existing.ALLOWED_USER_ID,
    PORT: port,
  }
}

const claudeBin = await input({
  message: 'CLAUDE_BIN',
  default: existing.CLAUDE_BIN || '/usr/local/bin/claude',
})

const values = {
  PLATFORM: platform,
  ...platformValues,
  CLAUDE_BIN: claudeBin,
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
const HOMEBREW_BIN = '/opt/homebrew/bin'

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
    <string>${NODE_BIN_DIR}:${HOMEBREW_BIN}:/usr/local/bin:/usr/bin:/bin</string>
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
