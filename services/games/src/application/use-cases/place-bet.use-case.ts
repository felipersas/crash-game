import { Inject, Injectable, Logger } from '@nestjs/common';
import { Round, RoundStatus, DEFAULT_ROUND_CONFIG } from '@/domain/entities/round.entity';
import type { IRoundRepository } from '@/application/interfaces/round.repository';
import type { IBetRepository } from '@/application/interfaces/bet.repository';
import type { IEventPublisher } from '@crash/messaging';
import type { IUseCase } from '@/application/interfaces/use-case';
import { Money } from '@crash/domain';
import { BetNotFoundError } from '@/domain/errors/domain.errors';
import { ROUND_REPOSITORY, BET_REPOSITORY, EVENT_PUBLISHER } from '@/infrastructure/di/tokens';
import { GamesGateway } from '@/infrastructure/websocket/games.gateway';

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
  private readonly logger = new Logger(PlaceBetUseCase.name);

  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository,
    @Inject(BET_REPOSITORY) private readonly betRepository: IBetRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
    private readonly gamesGateway: GamesGateway,
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

    const amount = Money.fromCents(input.amountCents);

    // Create bet in memory (validates business rules)
    round.placeBet(input.playerId, amount);

    // Get the bet from round
    const bet = round.getBetByPlayer(input.playerId);
    if (!bet) {
      throw new BetNotFoundError();
    }

    // Persist bet independently (no round version lock)
    await this.betRepository.create(bet);

    // Update round version for state change
    await this.roundRepository.save(round);

    const events = round.pullEvents();
    if (events.length > 0) {
      await this.eventPublisher.publishBatch(events);
    }

    // Broadcast via WebSocket (fire-and-forget, non-blocking)
    try {
      this.gamesGateway.broadcastBetPlaced(
        round.id,
        bet.id,
        input.playerId,
        input.amountCents,
      );
    } catch (error) {
      this.logger.error('Failed to broadcast bet placed event', error);
    }

    return {
      roundId: round.id,
      betId: bet.id,
      amountCents: input.amountCents,
      status: round.getStatus(),
    };
  }
}
