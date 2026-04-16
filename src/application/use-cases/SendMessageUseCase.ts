import { Session } from '../../domain/entities/Session.js'
import { ClaudePort } from '../../domain/ports/ClaudePort.js'

export class SendMessageUseCase {
  constructor(
    private readonly claude: ClaudePort,
    private readonly session: Session,
  ) {}

  async execute(message: string, onProgress?: (elapsed: number) => void): Promise<string> {
    if (!this.session.isActive()) throw new Error('Session 未啟動，請先 /start')
    return this.claude.run(message, onProgress)
  }
}
