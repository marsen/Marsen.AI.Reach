import { Session } from '../../domain/entities/Session.js'

export class StopSessionUseCase {
  constructor(private readonly session: Session) {}

  execute(): void {
    this.session.stop()
  }
}
