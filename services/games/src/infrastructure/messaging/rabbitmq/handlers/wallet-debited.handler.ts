import { Injectable } from '@nestjs/common';
import { RoundId, BetId, PlayerId } from '@crash/domain';
import { ConfirmBetUseCase } from '@/application/use-cases/confirm-bet.use-case';
import { IdempotentInbox } from '@/infrastructure/messaging/inbox/idempotent-inbox';
import type { WalletDebitedMessage } from '@/infrastructure/messaging/types/wallet.events';

/**
 * WalletDebited → confirm the bet (PENDING → ACTIVE), at most once per bet.
 */
@Injectable()
export class WalletDebitedEventHandler {
  constructor(
    private readonly confirmBetUseCase: ConfirmBetUseCase,
    private readonly inbox: IdempotentInbox,
  ) {}

  async handle(event: WalletDebitedMessage): Promise<void> {
    await this.inbox.process(`wallet-debit-${event.betId}`, 'WalletDebited', event, async () => {
      await this.confirmBetUseCase.execute({
        roundId: RoundId.from(event.roundId),
        betId: BetId.from(event.betId),
        playerId: PlayerId.from(event.playerId),
      });
    });
  }
}
