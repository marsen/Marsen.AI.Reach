import { spawn } from 'child_process'
import { WORK_DIR } from './config.js'

const CLAUDE_BIN = '/Users/marsen/.local/bin/claude'

export async function runClaude(message: string, isFirst: boolean): Promise<string> {
  const baseArgs = ['--print', '--output-format', 'json', '--permission-mode', 'bypassPermissions']
  const args = isFirst
    ? [...baseArgs, message]
    : [...baseArgs, '--continue', message]

  return new Promise((resolve, reject) => {
    const env = { ...process.env }
    delete env.CLAUDECODE

    console.log('[claude] spawn:', CLAUDE_BIN, args)
    console.log('[claude] cwd:', WORK_DIR)
    console.log('[claude] CLAUDECODE in env:', 'CLAUDECODE' in env)

    const proc = spawn(CLAUDE_BIN, args, { cwd: WORK_DIR, env, stdio: ['ignore', 'pipe', 'pipe'] })

    console.log('[claude] pid:', proc.pid)

    let output = ''
    let errOutput = ''

    proc.stdout.on('data', (d) => {
      console.log('[claude] stdout chunk:', d.toString().slice(0, 100))
      output += d.toString()
    })
    proc.stderr.on('data', (d) => {
      console.log('[claude] stderr:', d.toString().slice(0, 200))
      errOutput += d.toString()
    })

    proc.on('close', (code) => {
      console.log('[claude] close, code:', code, 'output length:', output.length)
      if (code !== 0) reject(new Error(errOutput || `exit code ${code}`))
      else {
        try {
          const json = JSON.parse(output)
          resolve(json.result ?? output.trim())
        } catch {
          resolve(output.trim())
        }
      }
    })

    proc.on('error', (err) => {
      console.log('[claude] spawn error:', err)
      reject(err)
    })
  })
}
