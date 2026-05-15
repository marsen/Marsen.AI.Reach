import { execSync } from 'child_process'
import { writeFileSync } from 'fs'
import { ClaudePort } from '../../domain/ports/ClaudePort.js'
import { CLAUDE_BIN } from '../config/env.js'
import { cleanAnsi, hasPrompt, extractResponse } from './claudeParser.js'
import { Watcher } from './Watcher.js'

const SESSION = 'claude-reach'
const STABLE_POLLS = 3
const POLL_INTERVAL = 800
const DEFAULT_TIMEOUT = 300000
const PROGRESS_INTERVAL = 30000

let isProcessing = false
let activeWatcher: Watcher | null = null

function tmux(args: string): string {
  return execSync(`tmux ${args}`, { encoding: 'utf-8' })
}

function sessionExists(): boolean {
  try {
    tmux(`has-session -t ${SESSION}`)
    return true
  } catch {
    return false
  }
}

function isClaudeRunning(): boolean {
  try {
    execSync(`pgrep -f "${CLAUDE_BIN}"`, { encoding: 'utf-8' })
    return true
  } catch {
    return false
  }
}

let botPid = process.pid
let lastWorkDir = process.cwd()

export function setBotPid(pid: number): void {
  botPid = pid
}

async function createSession(workDir: string): Promise<void> {
  console.log('[claude] starting new tmux session...')
  tmux(`new-session -d -s ${SESSION} -x 220 -y 50`)
  const cmd = `cd ${workDir} && ${CLAUDE_BIN} --dangerously-skip-permissions; kill -USR1 ${botPid} 2>/dev/null; tmux kill-session -t ${SESSION}`
  tmux(`send-keys -t ${SESSION} "${cmd}" Enter`)
  await waitForStablePrompt(60000)
  console.log('[claude] session ready')
}

function capturePane(): string {
  return tmux(`capture-pane -t ${SESSION} -p -S -1000`)
}

async function waitForStablePrompt(
  timeout = DEFAULT_TIMEOUT,
  onProgress?: (elapsed: number) => void,
): Promise<void> {
  const start = Date.now()
  let lastOutput = ''
  let stableCount = 0
  let lastProgressAt = 0

  while (Date.now() - start < timeout) {
    const elapsed = Date.now() - start
    if (onProgress && elapsed - lastProgressAt >= PROGRESS_INTERVAL) {
      lastProgressAt = elapsed
      onProgress(elapsed)
    }

    const current = cleanAnsi(capturePane())

    if (current === lastOutput && hasPrompt(current)) {
      stableCount++
      if (stableCount >= STABLE_POLLS) return
    } else {
      stableCount = 0
    }

    lastOutput = current
    await new Promise((r) => setTimeout(r, POLL_INTERVAL))
  }

  throw new Error('等待 Claude 回應逾時')
}

let ensuringPromise: Promise<'new' | 'resumed'> | null = null

async function ensureSession(workDir: string): Promise<'new' | 'resumed'> {
  lastWorkDir = workDir
  if (ensuringPromise) return ensuringPromise
  ensuringPromise = _ensureSession(workDir).finally(() => { ensuringPromise = null })
  return ensuringPromise
}

async function _ensureSession(workDir: string): Promise<'new' | 'resumed'> {
  if (sessionExists() && isClaudeRunning()) return 'resumed'
  if (sessionExists()) tmux(`kill-session -t ${SESSION}`)
  await createSession(workDir)
  return 'new'
}

async function runClaude(message: string, onProgress?: (elapsed: number) => void): Promise<string> {
  isProcessing = true
  try {
    await ensureSession(lastWorkDir)

    const tmpFile = '/tmp/claude-reach-msg.txt'
    writeFileSync(tmpFile, message)
    tmux(`load-buffer ${tmpFile}`)
    tmux(`paste-buffer -t ${SESSION}`)
    tmux(`send-keys -t ${SESSION} Enter`)

    console.log('[claude] message sent, waiting for stable response...')

    await waitForStablePrompt(DEFAULT_TIMEOUT, onProgress)

    const pane = capturePane()
    const response = extractResponse(pane)
    activeWatcher?.setLastNotified(response)
    console.log('[claude] response length:', response.length, 'preview:', response.slice(0, 80))
    return response
  } finally {
    isProcessing = false
  }
}

export class TmuxClaudeAdapter implements ClaudePort {
  async run(message: string, onProgress?: (elapsed: number) => void): Promise<string> {
    return runClaude(message, onProgress)
  }

  async ensure(workDir: string): Promise<'new' | 'resumed'> {
    return ensureSession(workDir)
  }

  isRunning(): boolean {
    return sessionExists() && isClaudeRunning()
  }

  createWatcher(): Watcher {
    const watcher = new Watcher({
      getPane: capturePane,
      isProcessing: () => isProcessing,
      sessionExists,
    })
    activeWatcher = watcher
    return watcher
  }
}
