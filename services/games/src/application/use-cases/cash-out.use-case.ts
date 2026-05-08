import { Injectable, Inject } from '@nestjs/common';
import { Round } from '@/domain/entities/round.entity';
import type { IRoundRepository } from '../interfaces/round.repository';
import type { IBetRepository } from '../interfaces/bet.repository';
import type { IUseCase } from '../interfaces/use-case';
import type { IEventPublisher } from '@crash/messaging';
import { ROUND_REPOSITORY, BET_REPOSITORY, EVENT_PUBLISHER } from '@/infrastructure/di/tokens';
import { RoundLifecycleManager } from '@/infrastructure/scheduling/round-lifecycle-manager';
import { RoundNotFoundError, NoActiveBetError } from '@/domain/errors/domain.errors';

/**
 * Cash Out Use Case
 *
 * Allows a player to cash out their bet at the current multiplier.
 * Uses in-memory Round from LifecycleManager for real-time multiplier accuracy.
 */

export interface CashOutInput {
  playerId: string;
  roundId?: string; // Optional, defaults to current round
  idempotencyKey?: string; // Optional, prevents double-submit
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
  ) {}

  async execute(input: CashOutInput): Promise<CashOutOutput> {
    // IMPORTANT: Use in-memory Round from LifecycleManager for current multiplier
    // The DB Round has stale multiplier (updated only in-memory every 100ms)
    let round: Round | null = null;

    if (input.roundId) {
      // For specific round ID, load from DB (e.g., historical cashout)
      round = await this.roundRepository.findById(input.roundId);
    } else {
      // For current round, use LifecycleManager's in-memory Round
      round = this.roundLifecycleManager.getCurrentRound();
    }

    if (!round) {
      throw new RoundNotFoundError(input.roundId || 'current');
    }

    // Load bet to get bet ID for response
    const bet = await this.betRepository.findByPlayerAndRound(
      input.playerId,
      round.id,
    );

    if (!bet) {
      throw new NoActiveBetError(input.playerId, round.id);
    }

    // Cash out through Round (validates state, calculates payout, updates bet internally)
    const payout = round.cashOut(input.playerId);

    // TODO: Store idempotencyKey to prevent double-submit
    // For now, the Round.cashOut() will throw BetAlreadyCashedOutError if double-submitted

    // Save round state changes (includes bet update via Round entity)
    await this.roundRepository.save(round);

    const events = round.pullEvents();
    if (events.length > 0) {
      await this.eventPublisher.publishBatch(events);
    }

    return {
      betId: bet.id,
      roundId: round.id,
      playerId: input.playerId,
      cashOutMultiplier: round.getCurrentMultiplier(),
      payoutCents: payout.toCents(),
    };
  }
}
