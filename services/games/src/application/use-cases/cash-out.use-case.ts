import { Inject, Injectable } from '@nestjs/common';
import { Round, RoundStatus } from '@/domain/entities/round.entity';
import type { IRoundRepository } from '../interfaces/round.repository';
import type { IGameEventPublisher } from '../interfaces/event-publisher';
import type { ICommandHandler } from '../interfaces/command-handler';

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
export class CashOutUseCase implements ICommandHandler<CashOutInput, CashOutOutput> {
  constructor(
    @Inject('ROUND_REPOSITORY') private readonly roundRepository: IRoundRepository,
    @Inject('EVENT_PUBLISHER') private readonly eventPublisher: IGameEventPublisher,
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

    const payoutCents = round.cashOut(input.playerId);

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
      payoutCents,
    };
  }
}
