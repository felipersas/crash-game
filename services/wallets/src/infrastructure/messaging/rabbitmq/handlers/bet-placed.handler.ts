import { Inject, Injectable } from '@nestjs/common';
import { MetricsRecorderService, METRICS_RECORDER } from '@crash/observability';
import { DebitBetStakeUseCase } from '@/application/use-cases/debit-bet-stake.use-case';
import { IdempotentInbox } from '@/infrastructure/messaging/inbox/idempotent-inbox';
import type { BetPlacedMessage } from '@/infrastructure/messaging/types/games.events';

/**
 * BetPlaced → debit the stake and reply WalletDebited / WalletDebitFailed,
 * at most once per bet.
 */
@Injectable()
export class BetPlacedEventHandler {
  constructor(
    private readonly debitBetStakeUseCase: DebitBetStakeUseCase,
    private readonly inbox: IdempotentInbox,
    @Inject(METRICS_RECORDER) private readonly metrics: MetricsRecorderService,
  ) {}

  async handle(event: BetPlacedMessage): Promise<void> {
    this.metrics.incrRabbitConsumed('wallets.games.events', event.eventType);

    await this.inbox.process(`bet-${event.betId}`, event.eventType, event, async (inboxEventId) => {
      await this.debitBetStakeUseCase.execute({
        roundId: event.roundId,
        betId: event.betId,
        playerId: event.playerId,
        amountCents: BigInt(event.amount),
        inboxEventId,
      });
    });
  }
}
