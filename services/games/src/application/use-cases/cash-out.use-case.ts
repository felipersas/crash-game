import { Injectable, Inject, Logger } from '@nestjs/common';
import { IdempotencyKey, type PlayerId, type RoundId } from '@crash/domain';
import { MetricsRecorderService, METRICS_RECORDER } from '@crash/observability';
import { type Round, RoundStatus } from '@/domain/entities/round.entity';
import type { Bet } from '@/domain/entities/bet.entity';
import { Multiplier } from '@/domain/value-objects/multiplier.value-object';
import { RoundNotFoundError, NoActiveBetError } from '@/domain/errors/domain.errors';
import type { IRoundRepository } from '@/application/interfaces/round.repository';
import type { IBetRepository } from '@/application/interfaces/bet.repository';
import type { IAutoCashOutRepository } from '@/application/interfaces/auto-cashout.repository';
import type { IGameBroadcaster } from '@/application/interfaces/game-broadcaster';
import type { IRoundStateProvider } from '@/application/interfaces/round-state-provider';
import type { IUnitOfWork } from '@/application/interfaces/unit-of-work';
import type { IUseCase } from '@/application/interfaces/use-case';
import {
  ROUND_REPOSITORY,
  BET_REPOSITORY,
  UNIT_OF_WORK,
  GAME_BROADCASTER,
  ROUND_STATE_PROVIDER,
  AUTO_CASHOUT_REPOSITORY,
} from '@/application/di.tokens';

export interface CashOutInput {
  playerId: PlayerId;
  roundId?: RoundId;
  idempotencyKey: string;
  /** Auto cash-out target reached; overrides the live multiplier. */
  targetMultiplier?: number;
}

export interface CashOutOutput {
  betId: string;
  roundId: string;
  playerId: string;
  cashOutMultiplier: number;
  payoutCents: bigint;
}

/**
 * Cash Out Use Case - Application Layer
 *
 * Cashes out a player's active bet. Uses the live round from the lifecycle
 * manager so the payout reflects the real-time multiplier. Repeating a cash out
 * for an already cashed-out bet returns the stored result (idempotent).
 */
@Injectable()
export class CashOutUseCase implements IUseCase<CashOutInput, CashOutOutput> {
  private readonly logger = new Logger(CashOutUseCase.name);

  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository,
    @Inject(BET_REPOSITORY) private readonly betRepository: IBetRepository,
    @Inject(ROUND_STATE_PROVIDER) private readonly roundStateProvider: IRoundStateProvider,
    @Inject(AUTO_CASHOUT_REPOSITORY) private readonly autoCashOutRepository: IAutoCashOutRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: IUnitOfWork,
    @Inject(GAME_BROADCASTER) private readonly broadcaster: IGameBroadcaster,
    @Inject(METRICS_RECORDER) private readonly metrics: MetricsRecorderService,
  ) {}

  async execute(input: CashOutInput): Promise<CashOutOutput> {
    IdempotencyKey.from(input.idempotencyKey);

    const round = await this.loadRound(input.roundId);
    const bet = await this.betRepository.findByPlayerAndRound(input.playerId, round.id);
    if (!bet) {
      throw new NoActiveBetError();
    }

    if (bet.isCashedOut()) {
      return this.toOutput(bet);
    }

    // A manual cash out supersedes any pending auto cash-out target
    await this.removeAutoCashOutTarget(round.id, input.playerId);

    round.syncBet(bet);
    const multiplier =
      input.targetMultiplier !== undefined
        ? Multiplier.fromValue(input.targetMultiplier)
        : undefined;
    const payout = round.cashOut(input.playerId, multiplier);

    await this.unitOfWork.commit(round.id, round.pullEvents(), (tx) =>
      this.betRepository.update(bet, tx),
    );

    this.metrics.incrBet('cashed_out', Number(bet.getAmount().toCents()));
    this.metrics.incrPayout(Number(payout.toCents()));

    const output = this.toOutput(bet);
    this.broadcaster.broadcastPlayerCashedOut({
      roundId: output.roundId,
      betId: output.betId,
      playerId: output.playerId,
      playerName: bet.playerName,
      multiplier: output.cashOutMultiplier,
      payoutCents: output.payoutCents,
    });

    return output;
  }

  /**
   * Prefer the live ACTIVE round (real-time multiplier); otherwise fall back to
   * the requested round from the database.
   */
  private async loadRound(roundId?: RoundId): Promise<Round> {
    const liveRound = this.roundStateProvider.getCurrentRound();

    const round =
      liveRound?.getStatus() === RoundStatus.ACTIVE
        ? liveRound
        : roundId
          ? await this.roundRepository.findById(roundId)
          : liveRound;

    if (!round) {
      throw new RoundNotFoundError();
    }
    return round;
  }

  private async removeAutoCashOutTarget(roundId: string, playerId: string): Promise<void> {
    try {
      await this.autoCashOutRepository.removeTarget(roundId, playerId);
    } catch (error) {
      this.logger.error('Failed to remove auto cash-out target on cash out', error);
    }
  }

  private toOutput(bet: Bet): CashOutOutput {
    return {
      betId: bet.id,
      roundId: bet.roundId,
      playerId: bet.playerId,
      cashOutMultiplier: bet.getCashOutMultiplier()!.getValue(),
      payoutCents: bet.getCashOutAmount()!.toCents(),
    };
  }
}
