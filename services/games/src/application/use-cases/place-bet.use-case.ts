import { Inject, Injectable } from '@nestjs/common';
import { Money, type PlayerId } from '@crash/domain';
import { MetricsRecorderService, METRICS_RECORDER } from '@crash/observability';
import type { Bet, BetStatus } from '@/domain/entities/bet.entity';
import { RoundNotFoundError } from '@/domain/errors/domain.errors';
import type { IRoundRepository } from '@/application/interfaces/round.repository';
import type { IBetRepository } from '@/application/interfaces/bet.repository';
import type { IGameBroadcaster } from '@/application/interfaces/game-broadcaster';
import type { IUnitOfWork } from '@/application/interfaces/unit-of-work';
import type { IUseCase } from '@/application/interfaces/use-case';
import {
  ROUND_REPOSITORY,
  BET_REPOSITORY,
  UNIT_OF_WORK,
  GAME_BROADCASTER,
} from '@/application/di.tokens';

export interface PlaceBetInput {
  playerId: PlayerId;
  playerName: string;
  amountCents: bigint;
  autoCashOutMultiplier?: number;
}

export interface PlaceBetOutput {
  roundId: string;
  betId: string;
  amountCents: bigint;
  status: BetStatus;
  autoCashOutMultiplier: number | null;
}

/**
 * Place Bet Use Case - Application Layer
 *
 * Creates a PENDING bet on the current round (replacing a previous PENDING or
 * CANCELLED attempt) and emits BetPlaced so the wallet can debit the stake.
 */
@Injectable()
export class PlaceBetUseCase implements IUseCase<PlaceBetInput, PlaceBetOutput> {
  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository,
    @Inject(BET_REPOSITORY) private readonly betRepository: IBetRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: IUnitOfWork,
    @Inject(GAME_BROADCASTER) private readonly broadcaster: IGameBroadcaster,
    @Inject(METRICS_RECORDER) private readonly metrics: MetricsRecorderService,
  ) {}

  async execute(input: PlaceBetInput): Promise<PlaceBetOutput> {
    const round = await this.roundRepository.findCurrentRound();
    if (!round) {
      throw new RoundNotFoundError();
    }

    const { bet, replacedBet } = round.placeOrReplaceBet(
      input.playerId,
      input.playerName,
      Money.fromCents(input.amountCents),
      input.autoCashOutMultiplier,
    );

    await this.unitOfWork.commit(round.id, round.pullEvents(), async (tx) => {
      if (replacedBet) {
        await this.betRepository.update(replacedBet, tx);
      }
      await this.betRepository.create(bet, tx);
    });

    if (replacedBet) {
      this.notifyReplaced(replacedBet);
    }

    this.metrics.incrBet('placed', Number(input.amountCents));
    this.broadcaster.broadcastBetPlaced({
      roundId: round.id,
      betId: bet.id,
      playerId: bet.playerId,
      playerName: bet.playerName,
      amountCents: bet.getAmount().toCents(),
    });

    return {
      roundId: round.id,
      betId: bet.id,
      amountCents: bet.getAmount().toCents(),
      status: bet.getStatus(),
      autoCashOutMultiplier: bet.getAutoCashOutMultiplier(),
    };
  }

  private notifyReplaced(replacedBet: Bet): void {
    this.metrics.incrBet('cancelled', Number(replacedBet.getAmount().toCents()));
    this.broadcaster.broadcastBetCancelled({
      roundId: replacedBet.roundId,
      betId: replacedBet.id,
      playerId: replacedBet.playerId,
      playerName: replacedBet.playerName,
      amountCents: replacedBet.getAmount().toCents(),
      reason: replacedBet.getCancelReason() ?? '',
    });
  }
}
