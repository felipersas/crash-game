import { Inject, Injectable } from '@nestjs/common';
import { Round } from '@/domain/entities/round.entity';
import type { IRoundRepository } from '../interfaces/round.repository';
import type { IUseCase } from '../interfaces/use-case';
import type { IEventPublisher } from '@crash/messaging';

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
    @Inject('ROUND_REPOSITORY') private readonly roundRepository: IRoundRepository,
    @Inject('EVENT_PUBLISHER') private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(input: CashOutInput): Promise<CashOutOutput> {
    const roundId = input.roundId;
    let round: Round | null = null;

    if (roundId) {
      round = await this.roundRepository.findById(roundId);
    } else {
      round = await this.roundRepository.findCurrentRound();
    }

    if (!round) {
      throw new Error('No active round found');
    }

    const bet = round.getBetByPlayer(input.playerId);
    if (!bet) {
      throw new Error('No active bet found for player');
    }

    const payout = round.cashOut(input.playerId);

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
