import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Round, RoundStatus } from '@/domain/entities/round.entity';
import { OptimisticLockError } from '@/domain/errors/domain.errors';
import type { IRoundRepository } from '../interfaces/round.repository';
import type { IUseCase } from '../interfaces/use-case';
import { ROUND_REPOSITORY, GAME_BROADCASTER } from '../di.tokens';
import type { IGameBroadcaster } from '../interfaces/game-broadcaster';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { OutboxWriter } from '@/infrastructure/messaging/outbox-writer';

export interface StartRoundInput {
  round: Round;
}

export interface StartRoundOutput {
  round: Round;
}

/**
 * Start Round Use Case - Application Layer
 *
 * Transitions a round from BETTING to ACTIVE state.
 * Handles optimistic locking conflicts gracefully by reloading
 * from the database and retrying when necessary.
 */
@Injectable()
export class StartRoundUseCase implements IUseCase<StartRoundInput, StartRoundOutput> {
  private readonly logger = new Logger(StartRoundUseCase.name);

  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository,
    @Inject(GAME_BROADCASTER) private readonly broadcaster: IGameBroadcaster,
    private readonly prisma: PrismaService,
    private readonly outboxWriter: OutboxWriter,
  ) {}

  async execute(input: StartRoundInput): Promise<StartRoundOutput> {
    let resultRound = input.round;

    try {
      await resultRound.startRound();
      const events = resultRound.pullEvents();
      let outboxIds: string[] = [];
      await this.prisma.$transaction(async (tx) => {
        await this.roundRepository.save(resultRound, tx);
        if (events.length > 0) {
          outboxIds = await this.outboxWriter.writeWithinTransaction(tx, resultRound.id, events);
        }
      });

      // Best-effort immediate publish for low latency
      if (events.length > 0 && outboxIds.length > 0) {
        await this.outboxWriter.tryImmediatePublish(events, outboxIds);
      }
    } catch (error) {
      if (error instanceof OptimisticLockError) {
        this.logger.warn(
          `Optimistic lock conflict for round ${resultRound.id}, reloading from database`,
        );

        const reloaded = await this.roundRepository.findById(resultRound.id);
        if (!reloaded) {
          this.logger.error(`Round ${resultRound.id} not found after conflict`);
          throw error;
        }

        if (reloaded.getStatus() === RoundStatus.ACTIVE) {
          this.logger.log(`Round ${resultRound.id} already transitioned to ACTIVE`);
          resultRound = reloaded;
        } else if (reloaded.getStatus() === RoundStatus.BETTING) {
          this.logger.log(`Retrying transition for round ${reloaded.id}`);
          await reloaded.startRound();
          const retryEvents = reloaded.pullEvents();
          let retryOutboxIds: string[] = [];
          await this.prisma.$transaction(async (tx) => {
            await this.roundRepository.save(reloaded, tx);
            if (retryEvents.length > 0) {
              retryOutboxIds = await this.outboxWriter.writeWithinTransaction(
                tx,
                reloaded.id,
                retryEvents,
              );
            }
          });

          // Best-effort immediate publish for low latency
          if (retryEvents.length > 0 && retryOutboxIds.length > 0) {
            await this.outboxWriter.tryImmediatePublish(retryEvents, retryOutboxIds);
          }

          resultRound = reloaded;
        }
      } else {
        throw error;
      }
    }

    this.broadcaster.broadcastBettingEnded(resultRound.id);

    return { round: resultRound };
  }
}
