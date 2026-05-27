#!/usr/bin/env node
import { writeFileSync, mkdirSync, existsSync, readFileSync, chmodSync } from 'fs'
import { execSync } from 'child_process'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { fileURLToPath } from 'url'
import { input, password, confirm } from '@inquirer/prompts'

const PACKAGE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG_DIR = join(homedir(), '.rai')
const ENV_FILE = join(CONFIG_DIR, '.env')
const LAUNCHD_LABEL = 'com.marsen.rai'
const PLIST_DIR = join(homedir(), 'Library', 'LaunchAgents')
const PLIST_PATH = join(PLIST_DIR, `${LAUNCHD_LABEL}.plist`)

// Load existing values（keys only，不暴露值）
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

const isSet = (key) => !!existing[key]
const setStatus = (key) => isSet(key) ? '已設定 ✅' : '未設定'

console.log('🤖 rai 設定精靈\n')

// Telegram 金鑰設定（目前唯一支援平台）
const telegramConfigured = isSet('TELEGRAM_BOT_TOKEN') && isSet('TELEGRAM_USER_ID')
console.log(`  TELEGRAM_BOT_TOKEN：${setStatus('TELEGRAM_BOT_TOKEN')}`)
console.log(`  TELEGRAM_USER_ID：${setStatus('TELEGRAM_USER_ID')}\n`)

const reconfigure = telegramConfigured
  ? await confirm({ message: '要重新設定 Telegram 金鑰嗎？', default: false })
  : true

let platformValues
if (reconfigure) {
  const botToken = await password({ message: 'TELEGRAM_BOT_TOKEN', mask: true })
  const telegramUserId = await input({ message: 'TELEGRAM_USER_ID', default: existing.TELEGRAM_USER_ID })
  platformValues = {
    TELEGRAM_BOT_TOKEN: botToken || existing.TELEGRAM_BOT_TOKEN,
    TELEGRAM_USER_ID: telegramUserId || existing.TELEGRAM_USER_ID,
  }
} else {
  platformValues = {
    TELEGRAM_BOT_TOKEN: existing.TELEGRAM_BOT_TOKEN,
    TELEGRAM_USER_ID: existing.TELEGRAM_USER_ID,
  }
}

// CLAUDE_BIN
const claudeConfigured = isSet('CLAUDE_BIN')
console.log(`\n  CLAUDE_BIN：${setStatus('CLAUDE_BIN')}`)
const reconfigureClaude = claudeConfigured
  ? await confirm({ message: '要重新設定 CLAUDE_BIN 嗎？', default: false })
  : true

const claudeBin = reconfigureClaude
  ? await input({ message: 'CLAUDE_BIN', default: existing.CLAUDE_BIN || '/usr/local/bin/claude' })
  : existing.CLAUDE_BIN || '/usr/local/bin/claude'

// 寫入 .env（保留 existing，覆蓋新值）
const values = { ...platformValues, CLAUDE_BIN: claudeBin }
const finalValues = { ...existing, ...values }

mkdirSync(CONFIG_DIR, { recursive: true })
writeFileSync(ENV_FILE, Object.entries(finalValues).map(([k, v]) => `${k}=${v}`).join('\n') + '\n')
chmodSync(ENV_FILE, 0o600)
console.log(`\n✅ 設定完成，存至 ${ENV_FILE}`)

// 安裝 daemon launchd service
const TSX = join(PACKAGE_DIR, 'node_modules', '.bin', 'tsx')
const DAEMON_ENTRY = join(PACKAGE_DIR, 'src', 'presentation', 'daemon-entry.ts')
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
    <string>${DAEMON_ENTRY}</string>
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
  console.log(`✅ Bot 服務已安裝（${LAUNCHD_LABEL}）`)
} catch {
  console.log(`⚠️  服務安裝完成，但啟動失敗，請手動執行：`)
  console.log(`   launchctl load "${PLIST_PATH}"`)
}

// 確認 bot 啟動
const CLIENT = join(PACKAGE_DIR, 'bin', 'client.mjs')
process.stdout.write('⏳ 等待 Bot 啟動')
let botReady = false
for (let i = 0; i < 20; i++) {
  await new Promise(r => setTimeout(r, 1000))
  process.stdout.write('.')
  try {
    execSync(`node "${CLIENT}" status`, { stdio: 'ignore' })
    botReady = true
    break
  } catch {}
}
console.log(botReady ? '\n✅ Bot 已上線' : '\n⚠️  Bot 未回應，請執行 rai status 確認')
