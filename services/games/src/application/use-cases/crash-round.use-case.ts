import { Injectable, Inject, Logger } from '@nestjs/common';
import { MetricsRecorderService, METRICS_RECORDER } from '@crash/observability';
import { type Round, RoundStatus } from '@/domain/entities/round.entity';
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

export interface CrashRoundInput {
  /** Live round instance that reached its crash point. */
  round: Round;
}

export interface CrashRoundOutput {
  round: Round;
}

/**
 * Crash Round Use Case - Application Layer
 *
 * Persists a crash detected by the live round. The round is reloaded from the
 * database first because cash outs made through the API update bets
 * independently of the live instance. Round, settled bets and events are
 * committed atomically.
 */
@Injectable()
export class CrashRoundUseCase implements IUseCase<CrashRoundInput, CrashRoundOutput> {
  private readonly logger = new Logger(CrashRoundUseCase.name);

  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository,
    @Inject(BET_REPOSITORY) private readonly betRepository: IBetRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: IUnitOfWork,
    @Inject(GAME_BROADCASTER) private readonly broadcaster: IGameBroadcaster,
    @Inject(METRICS_RECORDER) private readonly metrics: MetricsRecorderService,
  ) {}

  async execute(input: CrashRoundInput): Promise<CrashRoundOutput> {
    const round = await this.roundRepository.findById(input.round.id);
    if (!round) {
      throw new RoundNotFoundError();
    }

    if (round.getStatus() !== RoundStatus.ACTIVE) {
      this.logger.warn(`Round ${round.id} is ${round.getStatus()} in the database, skipping crash`);
      return { round };
    }

    round.crash();
    const settledBets = round.getBets().filter((bet) => bet.isLost() || bet.isCancelled());

    await this.unitOfWork.commit(round.id, round.pullEvents(), async (tx) => {
      await this.roundRepository.save(round, tx);
      for (const bet of settledBets) {
        await this.betRepository.update(bet, tx);
      }
    });

    this.logger.log(
      `Round ${round.id} crashed at ${round.getCrashPoint()}x, settled ${settledBets.length} bets`,
    );
    this.recordMetrics(round);

    this.broadcaster.broadcastCrash({
      roundId: round.id,
      crashPoint: round.getCrashPoint()!,
      seed: round.getSeed(),
    });

    return { round };
  }

  private recordMetrics(round: Round): void {
    this.metrics.observeCrashPoint(round.getCrashPoint()!);

    const startedAt = round.getStartedAt();
    const crashedAt = round.getCrashedAt();
    if (startedAt && crashedAt) {
      this.metrics.observeRoundDuration((crashedAt.getTime() - startedAt.getTime()) / 1000);
    }

    let paidOutCents = 0n;
    for (const bet of round.getBets()) {
      if (bet.isCashedOut()) {
        paidOutCents += bet.getCashOutAmount()!.toCents();
      } else if (bet.isLost()) {
        this.metrics.incrBet('lost', Number(bet.getAmount().toCents()));
      } else if (bet.isCancelled()) {
        this.metrics.incrBet('cancelled', Number(bet.getAmount().toCents()));
      }
    }

    const wageredCents = round.getTotalWagered().toCents();
    if (wageredCents > 0n) {
      this.metrics.setRtp(Number((paidOutCents * 10_000n) / wageredCents) / 100);
    }
  }
}
