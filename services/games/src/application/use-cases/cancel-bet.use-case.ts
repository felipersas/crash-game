import { Inject, Injectable, Logger } from '@nestjs/common';
import type { BetId, PlayerId, RoundId } from '@crash/domain';
import { MetricsRecorderService, METRICS_RECORDER } from '@crash/observability';
import type { IBetRepository } from '@/application/interfaces/bet.repository';
import type { IAutoCashOutRepository } from '@/application/interfaces/auto-cashout.repository';
import type { IGameBroadcaster } from '@/application/interfaces/game-broadcaster';
import type { IUnitOfWork } from '@/application/interfaces/unit-of-work';
import type { IUseCase } from '@/application/interfaces/use-case';
import { loadOwnedBet } from '@/application/services/load-owned-bet';
import {
  BET_REPOSITORY,
  UNIT_OF_WORK,
  GAME_BROADCASTER,
  AUTO_CASHOUT_REPOSITORY,
} from '@/application/di.tokens';

export interface CancelBetInput {
  roundId: RoundId;
  betId: BetId;
  playerId: PlayerId;
  reason: string;
}

export interface CancelBetOutput {
  betId: string;
  roundId: string;
  playerId: string;
  reason: string;
}

/**
 * Cancel Bet Use Case - Application Layer
 *
 * Cancels a PENDING bet (wallet debit failure or confirmation timeout).
 */
@Injectable()
export class CancelBetUseCase implements IUseCase<CancelBetInput, CancelBetOutput> {
  private readonly logger = new Logger(CancelBetUseCase.name);

  constructor(
    @Inject(BET_REPOSITORY) private readonly betRepository: IBetRepository,
    @Inject(AUTO_CASHOUT_REPOSITORY) private readonly autoCashOutRepository: IAutoCashOutRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: IUnitOfWork,
    @Inject(GAME_BROADCASTER) private readonly broadcaster: IGameBroadcaster,
    @Inject(METRICS_RECORDER) private readonly metrics: MetricsRecorderService,
  ) {}

  async execute(input: CancelBetInput): Promise<CancelBetOutput> {
    const bet = await loadOwnedBet(this.betRepository, input);

    bet.cancel(input.reason);

    await this.unitOfWork.commit(bet.roundId, bet.pullEvents(), (tx) =>
      this.betRepository.update(bet, tx),
    );

    try {
      await this.autoCashOutRepository.removeTarget(bet.roundId, bet.playerId);
    } catch (error) {
      this.logger.error(`Failed to remove auto cash-out target for bet ${bet.id}`, error);
    }

    this.metrics.incrBet('cancelled', Number(bet.getAmount().toCents()));
    this.broadcaster.broadcastBetCancelled({
      roundId: bet.roundId,
      betId: bet.id,
      playerId: bet.playerId,
      playerName: bet.playerName,
      amountCents: bet.getAmount().toCents(),
      reason: input.reason,
    });

    return { betId: bet.id, roundId: bet.roundId, playerId: bet.playerId, reason: input.reason };
  }
}
