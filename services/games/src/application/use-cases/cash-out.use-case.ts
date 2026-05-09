import { Injectable, Inject } from '@nestjs/common';
import { Round, RoundStatus } from '@/domain/entities/round.entity';
import type { IRoundRepository } from '../interfaces/round.repository';
import type { IBetRepository } from '../interfaces/bet.repository';
import type { IUseCase } from '../interfaces/use-case';
import type { IEventPublisher } from '@crash/messaging';
import { RoundLifecycleManager } from '@/infrastructure/scheduling/round-lifecycle-manager';
import { RedisService, type CashoutIdempotencyResult } from '@/infrastructure/redis/redis.service';
import { RoundNotFoundError, NoActiveBetError, InvalidIdempotencyKeyError } from '@/domain/errors/domain.errors';
import { ROUND_REPOSITORY, BET_REPOSITORY, EVENT_PUBLISHER } from '@/infrastructure/di/tokens';

/**
 * Cash Out Use Case
 *
 * Allows a player to cash out their bet at the current multiplier.
 * Uses in-memory Round from LifecycleManager for real-time multiplier accuracy.
 */

export interface CashOutInput {
  playerId: string;
  roundId?: string;
  idempotencyKey: string;
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
  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository,
    @Inject(BET_REPOSITORY) private readonly betRepository: IBetRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
    private readonly roundLifecycleManager: RoundLifecycleManager,
    private readonly redisService: RedisService,
  ) {}

  async execute(input: CashOutInput): Promise<CashOutOutput> {
    const cachedResult = await this.getCachedResultIfValid(input);
    if (cachedResult) return cachedResult;

    const round = await this.loadRound(input.roundId);
    const bet = await this.loadBet(input.playerId, round.id);
    const payout = round.cashOut(input.playerId);

    await this.roundRepository.save(round);
    await this.storeIdempotencyResult(input.idempotencyKey, input.playerId, bet, round, payout);
    await this.publishEvents(round);

    return this.mapToOutput(input.playerId, bet, round, payout);
  }

  private async getCachedResultIfValid(input: CashOutInput): Promise<CashOutOutput | null> {
    this.validateIdempotencyKey(input.idempotencyKey);
    const cached = await this.redisService.checkCashoutIdempotency(input.idempotencyKey);

    if (!cached) return null;

    if (cached.playerId !== input.playerId) {
      throw new InvalidIdempotencyKeyError('Idempotency key belongs to different player');
    }

    return {
      betId: cached.betId,
      roundId: cached.roundId,
      playerId: cached.playerId,
      cashOutMultiplier: cached.cashOutMultiplier,
      payoutCents: BigInt(cached.payoutCents),
    };
  }

  private async loadRound(roundId?: string): Promise<Round> {
    let round: Round | null = null;

    const liveRound = this.roundLifecycleManager.getCurrentRound();

    if (liveRound && liveRound.getStatus() === RoundStatus.ACTIVE) {
      round = liveRound;
    } else if (roundId) {
      round = await this.roundRepository.findById(roundId);
    } else {
      round = liveRound;
    }

    if (!round) {
      throw new RoundNotFoundError(roundId || 'current');
    }

    return round;
  }

  private async loadBet(playerId: string, roundId: string) {
    const bet = await this.betRepository.findByPlayerAndRound(playerId, roundId);

    if (!bet) {
      throw new NoActiveBetError(playerId, roundId);
    }

    return bet;
  }

  private async storeIdempotencyResult(
    idempotencyKey: string,
    playerId: string,
    bet: { id: string },
    round: Round,
    payout: { toCents(): bigint },
  ): Promise<void> {
    const result: CashoutIdempotencyResult = {
      betId: bet.id,
      roundId: round.id,
      playerId,
      cashOutMultiplier: round.getCurrentMultiplier(),
      payoutCents: Number(payout.toCents()),
      cashedOutAt: new Date().toISOString(),
    };

    await this.redisService.setCashoutIdempotency(idempotencyKey, result);
  }

  private async publishEvents(round: Round): Promise<void> {
    const events = round.pullEvents();
    if (events.length === 0) return;

    await this.eventPublisher.publishBatch(events);
  }

  private mapToOutput(
    playerId: string,
    bet: { id: string },
    round: Round,
    payout: { toCents(): bigint },
  ): CashOutOutput {
    return {
      betId: bet.id,
      roundId: round.id,
      playerId,
      cashOutMultiplier: round.getCurrentMultiplier(),
      payoutCents: payout.toCents(),
    };
  }

  private validateIdempotencyKey(key: string): void {
    const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!UUID_V4_REGEX.test(key)) {
      throw new InvalidIdempotencyKeyError(key);
    }
  }
}
