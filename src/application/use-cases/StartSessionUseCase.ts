import { Session } from '../../domain/entities/Session.js'
import { ClaudePort } from '../../domain/ports/ClaudePort.js'

export class StartSessionUseCase {
  constructor(
    private readonly claude: ClaudePort,
    private readonly session: Session,
  ) {}

  async execute(workDir: string): Promise<'new' | 'resumed'> {
    const result = await this.claude.ensure(workDir)
    this.session.start()
    return result
  }
}
