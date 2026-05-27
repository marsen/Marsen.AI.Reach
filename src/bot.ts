/**
 * bot.ts —— 使用者進入點（host 端互動工具）
 *
 * 1. 檢查 daemon 在不在跑（試連 socket）
 * 2. 沒在跑就 detached spawn 一個 daemon-entry 進程
 * 3. 互動：顯示狀態 + 選舊/新/取消
 * 4. 送命令給 daemon、自動接管 terminal 進入 tmux session
 */
import 'dotenv/config'   // 唯一起點：只有 bot.ts 載 .env 檔；daemon 子進程繼承本 process 的 env
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { setTimeout as sleep } from 'timers/promises'
import { select } from '@inquirer/prompts'
import { createComposition } from './infrastructure/composition'
import { EnvConfig } from './infrastructure/EnvConfig'

const { botConnection } = createComposition(new EnvConfig())

/** 進入點：確保 daemon 在跑 → 顯示狀態 → 互動選擇 → 派工 → 接管 terminal */
async function main(): Promise<void> {
  try {
    await spawnDaemon()
    const info = await botConnection.info()
    const cwd = process.cwd()
    printStatus(info.workDir, cwd)
    const action = await chooseAction(info, cwd)
    await dispatchChoice(action, cwd)
    attachTmux(info.sessionName)
  } catch (e) {
    handleError(e)
  }
}

/** 印「daemon 記得的目錄」與「目前目錄」讓使用者比對 */
function printStatus(workDir: string | null, cwd: string): void {
  console.log(`目前目錄：${workDir ?? '(無)'}`)
  console.log(`新目錄:   ${cwd}`)
}

/** 跳互動選單；resume 在 session 沒活時 disable，使用者無法誤選 */
function chooseAction(
  info: { workDir: string | null; sessionAlive: boolean },
  cwd: string,
): Promise<string> {
  return select({
    message: '選擇動作',
    choices: [
      { name: `進入舊 session (${info.workDir})`, value: 'resume', disabled: !info.sessionAlive },
      { name: `啟動新 session (${cwd})`, value: 'new' },
      { name: '取消', value: 'cancel' },
    ],
  })
}

/** 依選擇分派：cancel→退出；new→啟動新 session；resume→不做事，直接讓 main 走到 attachTmux */
async function dispatchChoice(choice: string, cwd: string): Promise<void> {
  if (choice === 'cancel') process.exit(0)
  if (choice === 'new') await startNewSession(cwd)
}

/** 送 start 命令到 daemon；daemon 內部會 kill 舊 tmux session、開新的、等 Claude prompt 穩定 */
async function startNewSession(cwd: string): Promise<void> {
  console.log('⏳ Claude 啟動中（最多 60 秒）...')
  await botConnection.start(cwd)
  console.log('✅ session 就緒')
}

/** 統一錯誤出口；@inquirer 的 Ctrl+C 會丟 ExitPromptError，視為使用者取消（exit 0） */
function handleError(e: unknown): never {
  if (e instanceof Error && e.name === 'ExitPromptError') process.exit(0)
  console.error(`❌ ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
}

/** 確保 daemon 在跑（idempotent）：在跑就跳過，否則 fork 一個並等就緒 */
async function spawnDaemon(): Promise<void> {
  if (await botConnection.isAlive()) return
  console.log('⏳ 啟動 daemon...')
  forkDaemon()
  await waitForDaemonReady()
}

/** fork daemon-entry 成獨立 background process；三件套讓它脫離 bot 生命週期 */
function forkDaemon(): void {
  const daemonEntry = join(dirname(fileURLToPath(import.meta.url)), 'daemon-entry.ts')
  // detached + stdio:'ignore' + unref() 三件一組：讓 daemon 脫離本 process，bot 結束後繼續活著
  const child = spawn(
    process.argv[0],
    [...process.execArgv, daemonEntry],
    { detached: true, stdio: 'ignore' },
  )
  child.unref()
}

/** 輪詢 socket 直到 daemon 能連上（spawn 是同步回傳，daemon 還沒 listen socket）；逾時 throw */
async function waitForDaemonReady(): Promise<void> {
  const begin = Date.now()
  const timeoutMs = 3000
  while (Date.now() - begin < timeoutMs) {
    if (await botConnection.isAlive()) return
    await sleep(100)
  }
  throw new Error('Daemon 啟動逾時')
}

/** 把本 process 的 terminal 接到 daemon 開的 tmux session；已在 tmux 內改用 switch-client 避免 nested */
function attachTmux(sessionName: string): void {
  // 已在 tmux 內用 switch-client（避免 nested session），否則 attach
  const args = process.env.TMUX
    ? ['switch-client', '-t', sessionName]
    : ['attach', '-t', sessionName]

  const tmux = spawn('tmux', args, { stdio: 'inherit' })
  tmux.on('error', (e) => {
    console.error(`❌ 無法啟動 tmux：${e.message}`)
    process.exit(1)
  })
  tmux.on('exit', (code) => process.exit(code ?? 0))
}

main()
