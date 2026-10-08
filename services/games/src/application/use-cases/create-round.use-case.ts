import { Injectable, Inject } from '@nestjs/common';
import type { Round } from '@/domain/entities/round.entity';
import type { IRoundRepository } from '@/application/interfaces/round.repository';
import type { IGameBroadcaster } from '@/application/interfaces/game-broadcaster';
import type { IUnitOfWork } from '@/application/interfaces/unit-of-work';
import type { IUseCase } from '@/application/interfaces/use-case';
import { ROUND_REPOSITORY, UNIT_OF_WORK, GAME_BROADCASTER } from '@/application/di.tokens';

export interface CreateRoundInput {
  round: Round;
}

export interface CreateRoundOutput {
  round: Round;
}

/**
 * Create Round Use Case - Application Layer
 *
 * Persists a new round (created by the lifecycle manager from the seed chain)
 * and announces its betting phase.
 */
@Injectable()
export class CreateRoundUseCase implements IUseCase<CreateRoundInput, CreateRoundOutput> {
  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: IUnitOfWork,
    @Inject(GAME_BROADCASTER) private readonly broadcaster: IGameBroadcaster,
  ) {}

  async execute({ round }: CreateRoundInput): Promise<CreateRoundOutput> {
    await this.unitOfWork.commit(round.id, round.pullEvents(), (tx) =>
      this.roundRepository.create(round, tx),
    );

    this.broadcaster.broadcastRoundStarted({
      roundId: round.id,
      seedHash: round.getSeedHash(),
      bettingEndTime: round.getBettingEndTime()!,
    });

    return { round };
  }
}
