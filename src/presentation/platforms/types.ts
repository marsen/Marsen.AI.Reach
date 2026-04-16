import type express from 'express'
import type { StartSessionUseCase } from '../../application/use-cases/StartSessionUseCase.js'
import type { StopSessionUseCase } from '../../application/use-cases/StopSessionUseCase.js'
import type { SendMessageUseCase } from '../../application/use-cases/SendMessageUseCase.js'
import type { Session } from '../../domain/entities/Session.js'
import type { SessionLogger } from '../../infrastructure/logger/SessionLogger.js'
import type { ClaudePort } from '../../domain/ports/ClaudePort.js'

export interface AdapterDeps {
  startSession: StartSessionUseCase
  stopSession: StopSessionUseCase
  sendMessage: SendMessageUseCase
  claude: ClaudePort
  session: Session
  getWorkDir: () => string
  getLogger: () => SessionLogger | null
  setLogger: (l: SessionLogger | null) => void
  ensureLogger: (workDir: string) => void
  log: (msg: string) => void
}

export interface PlatformAdapter {
  router: express.Router
  push(text: string): Promise<void>
  httpPort: number | null  // null 表示不需要 HTTP server（如 Telegram Long Polling）
}
