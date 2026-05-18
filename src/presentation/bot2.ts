/**
 * bot2.ts —— 使用者進入點（PC 端互動工具）
 *
 * 1. 檢查 daemon 在不在跑（試連 socket）
 * 2. 沒在跑就 detached spawn 一個 daemon-entry 進程
 * 3. 互動：顯示狀態 + 選舊/新/取消
 * 4. 送命令給 daemon、自動接管 terminal 進入 tmux session
 */
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { select } from '@inquirer/prompts'
import { botConnection, TMUX_SESSION } from '../composition.js'

async function isDaemonAlive(): Promise<boolean> {
  try { await botConnection.info(); return true }
  catch { return false }
}

async function spawnDaemon(): Promise<void> {
  const daemonEntry = join(dirname(fileURLToPath(import.meta.url)), 'daemon-entry.ts')

  const child = spawn(
    process.argv[0],
    [...process.execArgv, daemonEntry],
    { detached: true, stdio: 'ignore' },
  )
  child.unref()

  const begin = Date.now()
  while (Date.now() - begin < 3000) {
    if (await isDaemonAlive()) return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('Daemon 啟動逾時')
}

function attachTmux(): void {
  // 已在 tmux 內用 switch-client（避免 nested session），否則 attach
  const args = process.env.TMUX
    ? ['switch-client', '-t', TMUX_SESSION]
    : ['attach', '-t', TMUX_SESSION]

  const tmux = spawn('tmux', args, { stdio: 'inherit' })
  tmux.on('error', (e) => {
    console.error(`❌ 無法啟動 tmux：${e.message}`)
    process.exit(1)
  })
  tmux.on('exit', (code) => process.exit(code ?? 0))
}

if (!(await isDaemonAlive())) {
  console.log('⏳ 啟動 daemon...')
  await spawnDaemon()
}

const info = await botConnection.info()
const cwd = process.cwd()

console.log(`目前目錄：${info.workDir ?? '(無)'}`)
console.log(`新目錄：  ${cwd}`)

try {
  const choice = await select({
    message: '選擇動作',
    choices: [
      { name: `進入舊 session (${info.workDir})`, value: 'resume', disabled: !info.sessionAlive },
      { name: `啟動新 session (${cwd})`, value: 'new' },
      { name: '取消', value: 'cancel' },
    ],
  })

  if (choice === 'cancel') process.exit(0)

  if (choice === 'new') {
    console.log('⏳ Claude 啟動中（最多 60 秒）...')
    await botConnection.start(cwd)
    console.log('✅ session 就緒')
  }

  attachTmux()
} catch (e) {
  if (e instanceof Error && e.name === 'ExitPromptError') process.exit(0)
  console.error(`❌ ${(e as Error).message}`)
  process.exit(1)
}
