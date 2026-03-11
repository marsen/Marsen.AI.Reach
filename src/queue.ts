import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { QUEUE_DIR, INBOX_FILE, REPLY_FILE } from './config.js'

export function ensureQueueDir() {
  if (!existsSync(QUEUE_DIR)) mkdirSync(QUEUE_DIR, { recursive: true })
}

export function writeInbox(message: string) {
  ensureQueueDir()
  writeFileSync(INBOX_FILE, JSON.stringify({ message, at: Date.now() }))
}

export function readInbox(): { message: string; at: number } | null {
  if (!existsSync(INBOX_FILE)) return null
  return JSON.parse(readFileSync(INBOX_FILE, 'utf-8'))
}

export function clearInbox() {
  if (existsSync(INBOX_FILE)) writeFileSync(INBOX_FILE, '')
}

export function writeReply(reply: string) {
  ensureQueueDir()
  writeFileSync(REPLY_FILE, JSON.stringify({ reply, at: Date.now() }))
}

export function readReply(): { reply: string; at: number } | null {
  if (!existsSync(REPLY_FILE)) return null
  const content = readFileSync(REPLY_FILE, 'utf-8')
  if (!content.trim()) return null
  return JSON.parse(content)
}

export function clearReply() {
  if (existsSync(REPLY_FILE)) writeFileSync(REPLY_FILE, '')
}
