import { Inject, Injectable, Logger } from '@nestjs/common';
import { Round, type RoundStatus, DEFAULT_ROUND_CONFIG } from '@/domain/entities/round.entity';
import { BetStatus } from '@/domain/entities/bet.entity';
import type { IRoundRepository } from '@/application/interfaces/round.repository';
import type { IBetRepository } from '@/application/interfaces/bet.repository';
import type { IEventPublisher } from '@crash/messaging';
import type { IUseCase } from '@/application/interfaces/use-case';
import { Money } from '@crash/domain';
import { MetricsRecorderService, METRICS_RECORDER } from '@crash/observability';
import { BetNotFoundError, DuplicateBetError } from '@/domain/errors/domain.errors';
import {
  ROUND_REPOSITORY,
  BET_REPOSITORY,
  EVENT_PUBLISHER,
  GAME_BROADCASTER,
} from '@/infrastructure/di/tokens';
import type { IGameBroadcaster } from '@/application/interfaces/game-broadcaster';

export interface PlaceBetInput {
  playerId: string;
  playerName: string;
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
    @Inject(GAME_BROADCASTER) private readonly broadcaster: IGameBroadcaster,
    @Inject(METRICS_RECORDER) private readonly metrics: MetricsRecorderService,
  ) {}

  async execute(input: PlaceBetInput): Promise<PlaceBetOutput> {
    let round = await this.roundRepository.findCurrentRound();

    if (!round) {
      round = await Round.create(DEFAULT_ROUND_CONFIG);
      await this.roundRepository.create(round);

      const events = round.pullEvents();
      if (events.length > 0) {
        await this.eventPublisher.publishBatch(events);
      }
    }

    const amount = Money.fromCents(input.amountCents);

    const existingBet = await this.betRepository.findByPlayerAndRound(input.playerId, round.id);
    if (existingBet) {
      const status = existingBet.getStatus();
      // Allow replacement for PENDING (wallet not confirmed) and CANCELLED (wallet rejected/timeout)
      if (status === BetStatus.PENDING || status === BetStatus.CANCELLED) {
        if (status === BetStatus.PENDING) {
          existingBet.cancel('Replaced by new bet attempt');
          await this.betRepository.update(existingBet);
          this.metrics.incrBet('cancelled', Number(existingBet.getAmount().toCents()));
        }
        round.removeBet(input.playerId);

        try {
          this.broadcaster.broadcastBetCancelled(
            round.id,
            existingBet.id,
            input.playerId,
            existingBet.playerName,
            existingBet.getAmount().toCents(),
            'Replaced by new bet attempt',
          );
        } catch (error) {
          this.logger.error('Failed to broadcast bet cancelled event (replaced)', error);
        }
      } else {
        throw new DuplicateBetError();
      }
    }

    round.placeBet(input.playerId, input.playerName, amount);

    const bet = round.getBetByPlayer(input.playerId);
    if (!bet) {
      throw new BetNotFoundError();
    }

    await this.betRepository.create(bet);

    this.metrics.incrBet('placed', Number(input.amountCents));

    await this.roundRepository.save(round);

    const events = round.pullEvents();
    if (events.length > 0) {
      await this.eventPublisher.publishBatch(events);
    }

    try {
      this.broadcaster.broadcastBetPlaced(
        round.id,
        bet.id,
        input.playerId,
        input.playerName,
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
