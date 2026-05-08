import { Inject, Injectable } from '@nestjs/common';
import { Round, RoundStatus, DEFAULT_ROUND_CONFIG } from '@/domain/entities/round.entity';
import type { IRoundRepository } from '@/application/interfaces/round.repository';
import type { IEventPublisher } from '@crash/messaging';
import type { IUseCase } from '@/application/interfaces/use-case';
import { Money } from '@crash/domain';
import {
  RoundNotAcceptingBetsError,
  DuplicateBetError,
  BetBelowMinimumError,
  BetAboveMaximumError,
} from '@/domain/errors/domain.errors';

export interface PlaceBetInput {
  playerId: string;
  amountCents: bigint;
}

export interface PlaceBetOutput {
  roundId: string;
  betId: string;
  amountCents: bigint;
  status: RoundStatus;
}

@Injectable()
export class PlaceBetUseCase implements IUseCase<PlaceBetInput, PlaceBetOutput> {
  constructor(
    @Inject('ROUND_REPOSITORY') private readonly roundRepository: IRoundRepository,
    @Inject('EVENT_PUBLISHER') private readonly eventPublisher: IEventPublisher,
  ) {}

  async execute(input: PlaceBetInput): Promise<PlaceBetOutput> {
    let round = await this.roundRepository.findCurrentRound();

    // If no current round, create one
    if (!round) {
      round = await Round.create(DEFAULT_ROUND_CONFIG);
      await this.roundRepository.create(round);

      const events = round.pullEvents();
      if (events.length > 0) {
        await this.eventPublisher.publishBatch(events);
      }
    }

    // Convert bigint to Money
    const amount = Money.fromCents(input.amountCents);

    // Place the bet
    round.placeBet(input.playerId, amount);

    await this.roundRepository.save(round);

    const events = round.pullEvents();
    if (events.length > 0) {
      await this.eventPublisher.publishBatch(events);
    }

    const bet = round.getBetByPlayer(input.playerId);

    return {
      roundId: round.id,
      betId: bet?.id || '',
      amountCents: input.amountCents,
      status: round.getStatus(),
    };
  }
}
