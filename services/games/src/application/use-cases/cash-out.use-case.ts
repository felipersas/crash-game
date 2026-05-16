import { Injectable, Inject, Logger } from '@nestjs/common';
import { type Round, RoundStatus } from '@/domain/entities/round.entity';
import { BetStatus } from '@/domain/entities/bet.entity';
import type { IRoundRepository } from '../interfaces/round.repository';
import type { IBetRepository } from '../interfaces/bet.repository';
import type { IUseCase } from '../interfaces/use-case';
import type { IGameEventPublisher } from '@/application/interfaces/event-publisher';
import { MetricsRecorderService, METRICS_RECORDER } from '@crash/observability';
import { RoundNotFoundError, NoActiveBetError } from '@/domain/errors/domain.errors';
import {
  ROUND_REPOSITORY,
  BET_REPOSITORY,
  EVENT_PUBLISHER,
  GAME_BROADCASTER,
  ROUND_STATE_PROVIDER,
} from '@/application/di.tokens';
import type { IGameBroadcaster } from '@/application/interfaces/game-broadcaster';
import type { IRoundStateProvider } from '@/application/interfaces/round-state-provider';
import type { PlayerCashedOutEvent } from '@/domain/events/round.events';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { OutboxWriter } from '@/infrastructure/messaging/outbox-writer';
import { type PlayerId, type RoundId, PlayerId as PlayerIdVO, IdempotencyKey } from '@crash/domain';
import { Multiplier } from '@/domain/value-objects/multiplier.value-object';

/**
 * Cash Out Use Case
 *
 * Allows a player to cash out their bet at the current multiplier.
 * Uses in-memory Round from LifecycleManager for real-time multiplier accuracy.
 */

export interface CashOutInput {
  playerId: PlayerId;
  roundId?: RoundId;
  idempotencyKey: string;
  targetMultiplier?: number;
}

export interface CashOutOutput {
  betId: string;
  roundId: string;
  playerId: string;
  cashOutMultiplier: number;
  payoutCents: bigint;
}

@Injectable()
export class CashOutUseCase implements IUseCase<CashOutInput, CashOutOutput> {
  private readonly logger = new Logger(CashOutUseCase.name);

  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository,
    @Inject(BET_REPOSITORY) private readonly betRepository: IBetRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IGameEventPublisher,
    @Inject(ROUND_STATE_PROVIDER) private readonly roundStateProvider: IRoundStateProvider,
    @Inject(GAME_BROADCASTER) private readonly broadcaster: IGameBroadcaster,
    @Inject(METRICS_RECORDER) private readonly metrics: MetricsRecorderService,
    private readonly prisma: PrismaService,
    private readonly outboxWriter: OutboxWriter,
  ) {}

  async execute(input: CashOutInput): Promise<CashOutOutput> {
    IdempotencyKey.from(input.idempotencyKey);

    const round = await this.loadRound(input.roundId);
    const bet = await this.loadBet(input.playerId, round.id);

    // Idempotency: if bet is already cashed out, return existing result
    if (bet.getStatus() === BetStatus.CASHED_OUT) {
      const multiplier = bet.getCashOutMultiplier();
      const payoutAmount = bet.getCashOutAmount();
      if (multiplier && payoutAmount) {
        return {
          betId: bet.id,
          roundId: round.id,
          playerId: input.playerId,
          cashOutMultiplier: multiplier.getValue(),
          payoutCents: payoutAmount.toCents(),
        };
      }
    }

    round.syncBet(bet);
    const overrideMultiplier = input.targetMultiplier
      ? Multiplier.fromValue(input.targetMultiplier)
      : undefined;
    const payout = round.cashOut(input.playerId, overrideMultiplier);

    // Persist updated bet status + round + outbox events atomically
    const cashedOutBet = round.getBetByPlayer(input.playerId);
    const events = round.pullEvents();

    let outboxIds: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      if (cashedOutBet) {
        await this.betRepository.update(cashedOutBet, tx);
      }
      if (events.length > 0) {
        outboxIds = await this.outboxWriter.writeWithinTransaction(tx, round.id, events);
      }
    });

    // Best-effort immediate publish for low latency
    if (events.length > 0 && outboxIds.length > 0) {
      await this.outboxWriter.tryImmediatePublish(events, outboxIds);
    }

    this.metrics.incrBet('cashed_out', Number(bet.getAmount().toCents()));
    this.metrics.incrPayout(Number(payout.toCents()));

    await this.broadcastCashOut(round, events);

    return this.mapToOutput(input.playerId, bet, round, payout, overrideMultiplier);
  }

  private async loadRound(roundId?: RoundId): Promise<Round> {
    let round: Round | null = null;

    const liveRound = this.roundStateProvider.getCurrentRound();

    if (liveRound && liveRound.getStatus() === RoundStatus.ACTIVE) {
      round = liveRound;
    } else if (roundId) {
      round = await this.roundRepository.findById(roundId);
    } else {
      round = liveRound;
    }

    if (!round) {
      throw new RoundNotFoundError();
    }

    return round;
  }

  private async loadBet(playerId: PlayerId, roundId: RoundId) {
    const bet = await this.betRepository.findByPlayerAndRound(playerId, roundId);

    if (!bet) {
      throw new NoActiveBetError();
    }

    return bet;
  }

  private async broadcastCashOut(round: Round, events: any[]): Promise<void> {
    const cashedOut = events.find(
      (e): e is PlayerCashedOutEvent => e.eventType === 'PlayerCashedOut',
    );
    if (cashedOut) {
      const cashedOutBet = round.getBetByPlayer(PlayerIdVO.from(cashedOut.playerId));
      if (!cashedOutBet) {
        this.logger.warn(
          `Bet not found for cashed out player ${cashedOut.playerId} in round ${cashedOut.roundId}`,
        );
      }
      try {
        this.broadcaster.broadcastPlayerCashedOut(
          cashedOut.roundId,
          cashedOut.betId,
          cashedOut.playerId,
          cashedOutBet?.playerName ?? '',
          cashedOut.cashOutMultiplier,
          cashedOut.winAmount,
        );
      } catch (error) {
        this.logger.error('Failed to broadcast player cashed out event', error);
      }
    }
  }

  private mapToOutput(
    playerId: PlayerId,
    bet: { id: string },
    round: Round,
    payout: { toCents(): bigint },
    overrideMultiplier?: Multiplier,
  ): CashOutOutput {
    const effectiveMultiplier = overrideMultiplier
      ? overrideMultiplier.getValue()
      : round.getCurrentMultiplier();
    return {
      betId: bet.id,
      roundId: round.id,
      playerId,
      cashOutMultiplier: effectiveMultiplier,
      payoutCents: payout.toCents(),
    };
  }
}
