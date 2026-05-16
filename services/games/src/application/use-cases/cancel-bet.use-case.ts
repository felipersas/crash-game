import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IBetRepository } from '../interfaces/bet.repository';
import type { IUseCase } from '../interfaces/use-case';
import { MetricsRecorderService, METRICS_RECORDER } from '@crash/observability';
import { BET_REPOSITORY, GAME_BROADCASTER } from '@/application/di.tokens';
import { BetNotFoundError } from '@/domain/errors/domain.errors';
import { createBetCancelledEvent } from '@/domain/events/round.events';
import type { IGameBroadcaster } from '@/application/interfaces/game-broadcaster';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { OutboxWriter } from '@/infrastructure/messaging/outbox-writer';
import { type BetId, type RoundId, type PlayerId } from '@crash/domain';
import { AUTO_CASHOUT_REPOSITORY } from '@/application/di.tokens';
import type { IAutoCashOutRepository } from '@/application/interfaces/auto-cashout.repository';

export interface CancelBetInput {
  roundId: RoundId;
  betId: BetId;
  playerId: PlayerId;
  reason: string;
}

export interface CancelBetOutput {
  betId: string;
  roundId: string;
  playerId: string;
  reason: string;
}

/**
 * Cancel Bet Use Case - Application Layer
 *
 * Cancels a bet after wallet debit failure.
 * Transitions the bet from PENDING to CANCELLED state.
 * Writes BetCancelledEvent to outbox for reliable delivery.
 *
 * Now uses BetRepository directly for better concurrency.
 */
@Injectable()
export class CancelBetUseCase implements IUseCase<CancelBetInput, CancelBetOutput> {
  private readonly logger = new Logger(CancelBetUseCase.name);

  constructor(
    @Inject(BET_REPOSITORY) private readonly betRepository: IBetRepository,
    @Inject(GAME_BROADCASTER) private readonly broadcaster: IGameBroadcaster,
    @Inject(METRICS_RECORDER) private readonly metrics: MetricsRecorderService,
    private readonly prisma: PrismaService,
    private readonly outboxWriter: OutboxWriter,
    @Inject(AUTO_CASHOUT_REPOSITORY) private readonly autoCashOutRepo: IAutoCashOutRepository,
  ) {}

  async execute(input: CancelBetInput): Promise<CancelBetOutput> {
    const bet = await this.betRepository.findByPlayerAndRound(input.playerId, input.roundId);

    if (!bet) {
      throw new BetNotFoundError();
    }

    bet.cancel(input.reason);

    try {
      await this.autoCashOutRepo.removeTarget(input.roundId, input.playerId);
    } catch (error) {
      this.logger.error('Failed to remove auto cash-out target on cancel', error);
    }

    const event = createBetCancelledEvent(
      input.roundId,
      input.betId,
      input.playerId,
      bet.getAmount().toCents(),
      input.reason,
      1,
    );

    const outboxIds = await this.prisma.$transaction(async (tx) => {
      await this.betRepository.update(bet, tx);
      return this.outboxWriter.writeWithinTransaction(tx, input.roundId, [event]);
    });

    // Best-effort immediate publish for low latency
    if (outboxIds.length > 0) {
      await this.outboxWriter.tryImmediatePublish([event], outboxIds);
    }

    this.metrics.incrBet('cancelled', Number(bet.getAmount().toCents()));

    try {
      this.broadcaster.broadcastBetCancelled(
        input.roundId,
        input.betId,
        input.playerId,
        bet.playerName,
        bet.getAmount().toCents(),
        input.reason,
      );
    } catch (error) {
      this.logger.error('Failed to broadcast bet cancelled event', error);
    }

    return {
      betId: input.betId,
      roundId: input.roundId,
      playerId: input.playerId,
      reason: input.reason,
    };
  }
}
