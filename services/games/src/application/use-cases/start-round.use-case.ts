import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Round, RoundStatus } from '@/domain/entities/round.entity';
import {
  InvalidRoundStateError,
  OptimisticLockError,
  RoundNotFoundError,
} from '@/domain/errors/domain.errors';
import type { IRoundRepository } from '@/application/interfaces/round.repository';
import type { IGameBroadcaster } from '@/application/interfaces/game-broadcaster';
import type { IUnitOfWork } from '@/application/interfaces/unit-of-work';
import type { IUseCase } from '@/application/interfaces/use-case';
import { ROUND_REPOSITORY, UNIT_OF_WORK, GAME_BROADCASTER } from '@/application/di.tokens';

export interface StartRoundInput {
  round: Round;
}

export interface StartRoundOutput {
  round: Round;
}

/**
 * Start Round Use Case - Application Layer
 *
 * Transitions a round from BETTING to ACTIVE. On an optimistic lock conflict
 * the round is reloaded: if another writer already started it, that version
 * is used; if it is still BETTING the transition is retried once.
 */
@Injectable()
export class StartRoundUseCase implements IUseCase<StartRoundInput, StartRoundOutput> {
  private readonly logger = new Logger(StartRoundUseCase.name);

  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: IUnitOfWork,
    @Inject(GAME_BROADCASTER) private readonly broadcaster: IGameBroadcaster,
  ) {}

  async execute(input: StartRoundInput): Promise<StartRoundOutput> {
    let round = input.round;

    try {
      await this.start(round);
    } catch (error) {
      if (!(error instanceof OptimisticLockError)) throw error;

      this.logger.warn(`Optimistic lock conflict for round ${round.id}, reloading from database`);
      round = await this.reload(round.id);

      if (round.getStatus() === RoundStatus.BETTING) {
        await this.start(round);
      } else if (round.getStatus() !== RoundStatus.ACTIVE) {
        throw new InvalidRoundStateError(round.getStatus(), 'start');
      }
    }

    this.broadcaster.broadcastBettingEnded(round.id);

    return { round };
  }

  private async start(round: Round): Promise<void> {
    await round.startRound();
    await this.unitOfWork.commit(round.id, round.pullEvents(), (tx) =>
      this.roundRepository.save(round, tx),
    );
  }

  private async reload(roundId: Round['id']): Promise<Round> {
    const round = await this.roundRepository.findById(roundId);
    if (!round) {
      throw new RoundNotFoundError();
    }
    return round;
  }
}
