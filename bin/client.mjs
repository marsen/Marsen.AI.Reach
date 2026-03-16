#!/usr/bin/env node
import { createConnection } from 'net'
import { join } from 'path'
import { homedir } from 'os'

const SOCKET_PATH = join(homedir(), '.ai-reach', 'bot.sock')
const cmd = process.argv[2]

if (!cmd) {
  console.error('Usage: client.mjs <status|start>')
  process.exit(1)
}

const socket = createConnection(SOCKET_PATH)

socket.on('error', () => {
  // Bot not running
  process.exit(1)
})

socket.on('connect', () => {
  socket.write(cmd + '\n')
})

let output = ''
socket.on('data', (data) => {
  output += data.toString()
  const lines = output.split('\n')
  output = lines.pop() ?? ''
  for (const line of lines) {
    if (line) process.stdout.write(line + '\n')
  }
})

socket.on('end', () => {
  process.exit(0)
})

setTimeout(() => {
  process.exit(1)
}, 120000)
