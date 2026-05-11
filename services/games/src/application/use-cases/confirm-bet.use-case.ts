import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IBetRepository } from '../interfaces/bet.repository';
import type { IUseCase } from '../interfaces/use-case';
import { MetricsRecorderService, METRICS_RECORDER } from '@crash/observability';
import { BET_REPOSITORY, GAME_BROADCASTER } from '@/application/di.tokens';
import { BetNotFoundError } from '@/domain/errors/domain.errors';
import { createBetConfirmedEvent } from '@/domain/events/round.events';
import type { IGameBroadcaster } from '@/application/interfaces/game-broadcaster';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { OutboxWriter } from '@/infrastructure/messaging/outbox-writer';

export interface ConfirmBetInput {
  roundId: string;
  betId: string;
  playerId: string;
}

export interface ConfirmBetOutput {
  betId: string;
  roundId: string;
  playerId: string;
}

/**
 * Confirm Bet Use Case - Application Layer
 *
 * Confirms a bet after successful wallet debit.
 * Transitions the bet from PENDING to ACTIVE state.
 * Writes BetConfirmedEvent to outbox for reliable delivery.
 *
 * Now uses BetRepository directly for better concurrency.
 */
@Injectable()
export class ConfirmBetUseCase implements IUseCase<ConfirmBetInput, ConfirmBetOutput> {
  private readonly logger = new Logger(ConfirmBetUseCase.name);

  constructor(
    @Inject(BET_REPOSITORY) private readonly betRepository: IBetRepository,
    @Inject(GAME_BROADCASTER) private readonly broadcaster: IGameBroadcaster,
    @Inject(METRICS_RECORDER) private readonly metrics: MetricsRecorderService,
    private readonly prisma: PrismaService,
    private readonly outboxWriter: OutboxWriter,
  ) {}

  async execute(input: ConfirmBetInput): Promise<ConfirmBetOutput> {
    const bet = await this.betRepository.findByPlayerAndRound(input.playerId, input.roundId);

    if (!bet) {
      throw new BetNotFoundError();
    }

    bet.confirm();

    const event = createBetConfirmedEvent(
      input.roundId,
      input.betId,
      input.playerId,
      bet.getAmount().toCents(),
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

    this.metrics.incrBet('confirmed', Number(bet.getAmount().toCents()));

    try {
      this.broadcaster.broadcastBetConfirmed(
        input.roundId,
        input.betId,
        input.playerId,
        bet.playerName,
        bet.getAmount().toCents(),
      );
    } catch (error) {
      this.logger.error('Failed to broadcast bet confirmed event', error);
    }

    return {
      betId: input.betId,
      roundId: input.roundId,
      playerId: input.playerId,
    };
  }
}
