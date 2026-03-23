#!/usr/bin/env node
import { writeFileSync, mkdirSync, existsSync, readFileSync, chmodSync } from 'fs'
import { execSync } from 'child_process'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { fileURLToPath } from 'url'
import { select, input, password, confirm } from '@inquirer/prompts'

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

// 選擇平台
const platform = await select({
  message: '選擇平台',
  choices: [
    { value: 'line', name: 'LINE Messaging API（Webhook）' },
    { value: 'telegram', name: 'Telegram（Long Polling）' },
  ],
  default: existing.PLATFORM ?? 'line',
})

// 平台金鑰設定
let platformValues = {}
let tunnelName = existing.CLOUDFLARED_TUNNEL ?? ''
let hasCloudflared = false

if (platform === 'telegram') {
  const telegramConfigured = isSet('TELEGRAM_BOT_TOKEN') && isSet('TELEGRAM_USER_ID')
  console.log(`\n  TELEGRAM_BOT_TOKEN：${setStatus('TELEGRAM_BOT_TOKEN')}`)
  console.log(`  TELEGRAM_USER_ID：${setStatus('TELEGRAM_USER_ID')}\n`)

  const reconfigure = telegramConfigured
    ? await confirm({ message: '要重新設定 Telegram 金鑰嗎？', default: false })
    : true

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
} else {
  const lineConfigured = isSet('LINE_CHANNEL_SECRET') && isSet('LINE_CHANNEL_ACCESS_TOKEN') && isSet('ALLOWED_USER_ID')
  console.log(`\n  LINE_CHANNEL_SECRET：${setStatus('LINE_CHANNEL_SECRET')}`)
  console.log(`  LINE_CHANNEL_ACCESS_TOKEN：${setStatus('LINE_CHANNEL_ACCESS_TOKEN')}`)
  console.log(`  ALLOWED_USER_ID：${setStatus('ALLOWED_USER_ID')}\n`)

  const reconfigure = lineConfigured
    ? await confirm({ message: '要重新設定 LINE 金鑰嗎？', default: false })
    : true

  if (reconfigure) {
    const channelSecret = await password({ message: 'LINE_CHANNEL_SECRET', mask: true })
    const channelToken = await password({ message: 'LINE_CHANNEL_ACCESS_TOKEN', mask: true })
    const allowedUserId = await input({ message: 'ALLOWED_USER_ID (LINE userId)', default: existing.ALLOWED_USER_ID })
    platformValues = {
      LINE_CHANNEL_SECRET: channelSecret || existing.LINE_CHANNEL_SECRET,
      LINE_CHANNEL_ACCESS_TOKEN: channelToken || existing.LINE_CHANNEL_ACCESS_TOKEN,
      ALLOWED_USER_ID: allowedUserId || existing.ALLOWED_USER_ID,
    }
  } else {
    platformValues = {
      LINE_CHANNEL_SECRET: existing.LINE_CHANNEL_SECRET,
      LINE_CHANNEL_ACCESS_TOKEN: existing.LINE_CHANNEL_ACCESS_TOKEN,
      ALLOWED_USER_ID: existing.ALLOWED_USER_ID,
    }
  }

  const portConfigured = isSet('PORT')
  console.log(`  PORT：${portConfigured ? existing.PORT : '未設定'}`)
  const reconfigurePort = portConfigured
    ? await confirm({ message: '要重新設定 PORT 嗎？', default: false })
    : true
  const port = reconfigurePort
    ? await input({ message: 'PORT（Webhook 監聽埠）', default: existing.PORT ?? '57429', validate: (v) => /^\d+$/.test(v) ? true : '請輸入數字' })
    : existing.PORT ?? '57429'
  platformValues.PORT = port

  // cloudflared tunnel
  hasCloudflared = (() => { try { execSync('command -v cloudflared', { stdio: 'ignore' }); return true } catch { return false } })()
  if (!hasCloudflared) {
    console.log('\n⚠️  未偵測到 cloudflared，LINE Webhook 需要公開 HTTPS endpoint。')
    console.log('   安裝方式：brew install cloudflared')
    console.log('   安裝後重新執行 rai init 以完成設定。\n')
  } else {
    tunnelName = await input({
      message: 'Cloudflare Tunnel 名稱',
      default: existing.CLOUDFLARED_TUNNEL ?? '',
    })
    const webhookBaseUrl = await input({
      message: 'Webhook 公開 URL（例：https://rai.example.com）',
      default: existing.WEBHOOK_BASE_URL ?? '',
    })
    if (tunnelName) platformValues.CLOUDFLARED_TUNNEL = tunnelName
    if (webhookBaseUrl) {
      platformValues.WEBHOOK_BASE_URL = webhookBaseUrl
      console.log(`\n   Webhook URL：${webhookBaseUrl}/webhook`)
      console.log('   請確認此 URL 已設定至 LINE Developer Console。\n')
    }
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
const values = { PLATFORM: platform, ...platformValues, CLAUDE_BIN: claudeBin }
const finalValues = { ...existing, ...values }

mkdirSync(CONFIG_DIR, { recursive: true })
writeFileSync(ENV_FILE, Object.entries(finalValues).map(([k, v]) => `${k}=${v}`).join('\n') + '\n')
chmodSync(ENV_FILE, 0o600)
console.log(`\n✅ 設定完成，存至 ${ENV_FILE}`)

// 安裝 bot launchd service
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
  console.log(`✅ Bot 服務已安裝（${LAUNCHD_LABEL}）`)
} catch {
  console.log(`⚠️  服務安裝完成，但啟動失敗，請手動執行：`)
  console.log(`   launchctl load "${PLIST_PATH}"`)
}

// 確認 bot 啟動
const SOCKET_PATH = join(CONFIG_DIR, 'bot.sock')
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

// 安裝 cloudflared launchd service（LINE only）
if (platform === 'line' && tunnelName && hasCloudflared) {
  const CLOUDFLARED_BIN = execSync('which cloudflared', { encoding: 'utf-8' }).trim()
  const CLOUDFLARED_LABEL = 'com.marsen.cloudflared'
  const CLOUDFLARED_PLIST_PATH = join(PLIST_DIR, `${CLOUDFLARED_LABEL}.plist`)
  const CLOUDFLARED_LOG = join(CONFIG_DIR, 'cloudflared.log')

  const cloudflaredPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${CLOUDFLARED_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${CLOUDFLARED_BIN}</string>
    <string>tunnel</string>
    <string>run</string>
    <string>${tunnelName}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${homedir()}</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${CLOUDFLARED_LOG}</string>
  <key>StandardErrorPath</key>
  <string>${CLOUDFLARED_LOG}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
`
  writeFileSync(CLOUDFLARED_PLIST_PATH, cloudflaredPlist)
  try {
    execSync(`launchctl unload "${CLOUDFLARED_PLIST_PATH}" 2>/dev/null; launchctl load "${CLOUDFLARED_PLIST_PATH}"`)
    console.log(`✅ Cloudflare Tunnel 服務已安裝（${CLOUDFLARED_LABEL}）`)
  } catch {
    console.log(`⚠️  Cloudflare Tunnel plist 已產生，請手動執行：`)
    console.log(`   launchctl load "${CLOUDFLARED_PLIST_PATH}"`)
  }
}
