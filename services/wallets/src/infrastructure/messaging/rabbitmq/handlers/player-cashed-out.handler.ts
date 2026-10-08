import { Inject, Injectable } from '@nestjs/common';
import { PlayerId } from '@crash/domain';
import { MetricsRecorderService, METRICS_RECORDER } from '@crash/observability';
import { CreditWalletUseCase } from '@/application/use-cases/credit-wallet.use-case';
import { IdempotentInbox } from '@/infrastructure/messaging/inbox/idempotent-inbox';
import type { PlayerCashedOutMessage } from '@/infrastructure/messaging/types/games.events';

/**
 * PlayerCashedOut → credit the payout, at most once per bet.
 * Failures are rethrown so winnings are never silently lost.
 */
@Injectable()
export class PlayerCashedOutEventHandler {
  constructor(
    private readonly creditWalletUseCase: CreditWalletUseCase,
    private readonly inbox: IdempotentInbox,
    @Inject(METRICS_RECORDER) private readonly metrics: MetricsRecorderService,
  ) {}

  async handle(event: PlayerCashedOutMessage): Promise<void> {
    this.metrics.incrRabbitConsumed('wallets.games.events', event.eventType);

    await this.inbox.process(
      `cashout-${event.betId}`,
      event.eventType,
      event,
      async (inboxEventId) => {
        await this.creditWalletUseCase.execute({
          playerId: PlayerId.from(event.playerId),
          amountCents: BigInt(event.winAmount),
          reason: `Cash out at ${event.cashOutMultiplier}x in round ${event.roundId} (bet ${event.betId})`,
          inboxEventId,
        });
      },
    );
  }
}
