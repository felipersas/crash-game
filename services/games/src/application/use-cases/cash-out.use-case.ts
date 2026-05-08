import { Injectable, Inject } from '@nestjs/common';
import { Round } from '@/domain/entities/round.entity';
import type { IRoundRepository } from '../interfaces/round.repository';
import type { IBetRepository } from '../interfaces/bet.repository';
import type { IUseCase } from '../interfaces/use-case';
import type { IEventPublisher } from '@crash/messaging';
import { ROUND_REPOSITORY, BET_REPOSITORY, EVENT_PUBLISHER } from '@/infrastructure/di/tokens';
import { RoundLifecycleManager } from '@/infrastructure/scheduling/round-lifecycle-manager';

export interface CashOutInput {
  playerId: string;
  roundId?: string; // Optional, defaults to current round
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
      throw new Error('No active round found');
    }

    // Load bet to get bet ID for response
    const bet = await this.betRepository.findByPlayerAndRound(
      input.playerId,
      round.id,
    );

    if (!bet) {
      throw new Error('No active bet found for player');
    }

    // Cash out through Round (validates state, calculates payout)
    const payout = round.cashOut(input.playerId);

    // Update bet independently
    const updatedBet = await this.betRepository.findByPlayerAndRound(
      input.playerId,
      round.id,
    );

    if (updatedBet) {
      await this.betRepository.update(updatedBet);
    }

    // Save round state changes
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
