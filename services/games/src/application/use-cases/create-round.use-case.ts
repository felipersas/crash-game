import { Injectable, Inject, Logger } from '@nestjs/common';
import type { Round } from '@/domain/entities/round.entity';
import type { IRoundRepository } from '../interfaces/round.repository';
import type { IUseCase } from '../interfaces/use-case';
import { ROUND_REPOSITORY, GAME_BROADCASTER } from '@/application/di.tokens';
import type { IGameBroadcaster } from '@/application/interfaces/game-broadcaster';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { OutboxWriter } from '@/infrastructure/messaging/outbox-writer';

/**
 * Create Round Use Case
 *
 * Persists a new round and publishes its domain events via the outbox.
 * The round entity is created upstream by RoundLifecycleManager via
 * Round.createWithSeedChain() and passed in as input.
 */

export interface CreateRoundInput {
  round: Round;
}

export interface CreateRoundOutput {
  round: Round;
}

@Injectable()
export class CreateRoundUseCase implements IUseCase<CreateRoundInput, CreateRoundOutput> {
  private readonly logger = new Logger(CreateRoundUseCase.name);

  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository,
    @Inject(GAME_BROADCASTER) private readonly broadcaster: IGameBroadcaster,
    private readonly prisma: PrismaService,
    private readonly outboxWriter: OutboxWriter,
  ) {}

  async execute(input: CreateRoundInput): Promise<CreateRoundOutput> {
    const { round } = input;

    const events = round.pullEvents();

    let outboxIds: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      await this.roundRepository.create(round, tx);
      if (events.length > 0) {
        outboxIds = await this.outboxWriter.writeWithinTransaction(tx, round.id, events);
      }
    });

    // Best-effort immediate publish for low latency
    if (events.length > 0 && outboxIds.length > 0) {
      await this.outboxWriter.tryImmediatePublish(events, outboxIds);
    }

    // Broadcast RoundStarted event (non-blocking)
    const roundStarted = events.find((e) => e.eventType === 'RoundStarted');
    if (roundStarted) {
      try {
        this.broadcaster.broadcastRoundStarted(
          round.id,
          round.getSeedHash(),
          round.getBettingEndTime()!,
        );
      } catch (error) {
        this.logger.error('Failed to broadcast round started event', error);
      }
    }

    return { round };
  }
}
