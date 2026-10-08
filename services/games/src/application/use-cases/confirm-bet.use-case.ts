import { Inject, Injectable, Logger } from '@nestjs/common';
import type { BetId, PlayerId, RoundId } from '@crash/domain';
import { MetricsRecorderService, METRICS_RECORDER } from '@crash/observability';
import type { Bet } from '@/domain/entities/bet.entity';
import type { IBetRepository } from '@/application/interfaces/bet.repository';
import type { IAutoCashOutRepository } from '@/application/interfaces/auto-cashout.repository';
import type { IGameBroadcaster } from '@/application/interfaces/game-broadcaster';
import type { IRoundStateProvider } from '@/application/interfaces/round-state-provider';
import type { IUnitOfWork } from '@/application/interfaces/unit-of-work';
import type { IUseCase } from '@/application/interfaces/use-case';
import {
  BET_REPOSITORY,
  UNIT_OF_WORK,
  GAME_BROADCASTER,
  ROUND_STATE_PROVIDER,
  AUTO_CASHOUT_REPOSITORY,
} from '@/application/di.tokens';
import { loadOwnedBet } from '@/application/services/load-owned-bet';

export interface ConfirmBetInput {
  roundId: RoundId;
  betId: BetId;
  playerId: PlayerId;
}

export interface ConfirmBetOutput {
  betId: string;
  roundId: string;
  playerId: string;
}

/**
 * Confirm Bet Use Case - Application Layer
 *
 * Confirms a bet after successful wallet debit (PENDING → ACTIVE), makes it
 * visible to the live round and registers its auto cash-out target.
 */
@Injectable()
export class ConfirmBetUseCase implements IUseCase<ConfirmBetInput, ConfirmBetOutput> {
  private readonly logger = new Logger(ConfirmBetUseCase.name);

  constructor(
    @Inject(BET_REPOSITORY) private readonly betRepository: IBetRepository,
    @Inject(ROUND_STATE_PROVIDER) private readonly roundStateProvider: IRoundStateProvider,
    @Inject(AUTO_CASHOUT_REPOSITORY) private readonly autoCashOutRepository: IAutoCashOutRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: IUnitOfWork,
    @Inject(GAME_BROADCASTER) private readonly broadcaster: IGameBroadcaster,
    @Inject(METRICS_RECORDER) private readonly metrics: MetricsRecorderService,
  ) {}

  async execute(input: ConfirmBetInput): Promise<ConfirmBetOutput> {
    const bet = await loadOwnedBet(this.betRepository, input);

    bet.confirm();

    await this.unitOfWork.commit(bet.roundId, bet.pullEvents(), (tx) =>
      this.betRepository.update(bet, tx),
    );

    const liveRound = this.roundStateProvider.getCurrentRound();
    if (liveRound?.id === bet.roundId) {
      liveRound.syncBet(bet);
    }
    await this.registerAutoCashOut(bet);

    this.metrics.incrBet('confirmed', Number(bet.getAmount().toCents()));
    this.broadcaster.broadcastBetConfirmed({
      roundId: bet.roundId,
      betId: bet.id,
      playerId: bet.playerId,
      playerName: bet.playerName,
      amountCents: bet.getAmount().toCents(),
    });

    return { betId: bet.id, roundId: bet.roundId, playerId: bet.playerId };
  }

  private async registerAutoCashOut(bet: Bet): Promise<void> {
    const target = bet.getAutoCashOutMultiplier();
    if (target === null) return;

    try {
      await this.autoCashOutRepository.addTarget(bet.roundId, bet.playerId, target);
    } catch (error) {
      this.logger.error(`Failed to register auto cash-out target for bet ${bet.id}`, error);
    }
  }
}
