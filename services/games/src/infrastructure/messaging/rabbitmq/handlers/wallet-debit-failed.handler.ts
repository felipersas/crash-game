import { Injectable } from '@nestjs/common';
import { RoundId, BetId, PlayerId } from '@crash/domain';
import { CancelBetUseCase } from '@/application/use-cases/cancel-bet.use-case';
import { IdempotentInbox } from '@/infrastructure/messaging/inbox/idempotent-inbox';
import type { WalletDebitFailedMessage } from '@/infrastructure/messaging/types/wallet.events';

/**
 * WalletDebitFailed → cancel the bet (PENDING → CANCELLED), at most once per bet.
 */
@Injectable()
export class WalletDebitFailedEventHandler {
  constructor(
    private readonly cancelBetUseCase: CancelBetUseCase,
    private readonly inbox: IdempotentInbox,
  ) {}

  async handle(event: WalletDebitFailedMessage): Promise<void> {
    await this.inbox.process(
      `wallet-debit-fail-${event.betId}`,
      'WalletDebitFailed',
      event,
      async () => {
        await this.cancelBetUseCase.execute({
          roundId: RoundId.from(event.roundId),
          betId: BetId.from(event.betId),
          playerId: PlayerId.from(event.playerId),
          reason: event.reason,
        });
      },
    );
  }
}
