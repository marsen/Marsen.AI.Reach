import type { WatcherPort } from '../../domain/ports/WatcherPort.js'
import { cleanAnsi, hasPrompt, extractResponse } from './claudeParser.js'

const WATCHER_INTERVAL = 3000

export interface WatcherContext {
  getPane: () => string
  isProcessing: () => boolean
  sessionExists: () => boolean
}

export class Watcher implements WatcherPort {
  private lastSnapshot = ''
  private lastNotified = ''
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly ctx: WatcherContext) {}

  start(onNewContent: (content: string) => void): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      if (this.ctx.isProcessing() || !this.ctx.sessionExists()) return
      const current = cleanAnsi(this.ctx.getPane())
      if (current !== this.lastSnapshot && hasPrompt(current)) {
        const response = extractResponse(current)
        if (response && response !== this.lastNotified) {
          this.lastNotified = response
          onNewContent(response)
        }
        this.lastSnapshot = current
      }
    }, WATCHER_INTERVAL)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  setLastNotified(response: string): void {
    this.lastNotified = response
  }
}
