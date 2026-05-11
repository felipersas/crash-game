import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Round } from '@/domain/entities/round.entity';
import type { IRoundRepository } from '@/application/interfaces/round.repository';
import type { IBetRepository } from '@/application/interfaces/bet.repository';
import type { IGameEventPublisher } from '@/application/interfaces/event-publisher';
import {
  ROUND_REPOSITORY,
  BET_REPOSITORY,
  EVENT_PUBLISHER,
  GAMES_GATEWAY,
} from '@/infrastructure/di/tokens';
import { GamesGateway } from '@/infrastructure/websocket/games.gateway';
import { RedisService } from '@/infrastructure/redis/redis.service';

/**
 * Round Crash Handler - Infrastructure Layer
 *
 * Handles the crash phase of a round:
 * 1. Persists crashed round to DB (with optimistic lock retry)
 * 2. Settles bets (LOST/CANCELLED) via BetRepository
 * 3. Publishes domain events via message broker
 * 4. Broadcasts crash via WebSocket
 * 5. Cleans up Redis state
 */
@Injectable()
export class RoundCrashHandler {
  private readonly logger = new Logger(RoundCrashHandler.name);

  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository,
    @Inject(BET_REPOSITORY) private readonly betRepository: IBetRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IGameEventPublisher,
    @Inject(GAMES_GATEWAY) private readonly gamesGateway: GamesGateway,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Handle a round that has crashed.
   *
   * IMPORTANT: Reloads Round from DB before saving to handle race conditions
   * where cashouts occurred via API (which updates the Round independently).
   */
  async handleRoundCrashed(inMemoryRound: Round): Promise<Round> {
    const roundId = inMemoryRound.id;
    const crashPoint = inMemoryRound.getCrashPoint();

    this.logger.log(`Round ${roundId} crashed at ${crashPoint}x`);

    const latestRound = await this.roundRepository.findById(roundId);
    if (!latestRound) {
      this.logger.error(`Round ${roundId} not found in DB during crash handling`);
      await this.redisService.deleteRound(roundId);
      return inMemoryRound;
    }

    // The crash was already determined in-memory, but we need to apply it
    // to the DB version which has all the cashouts
    if (crashPoint) {
      const startedAt = latestRound.getStartedAt();
      if (startedAt) {
        const elapsedSinceStart = (Date.now() - startedAt.getTime()) / 1000;
        latestRound.updateMultiplier(elapsedSinceStart);
      }
    }

    try {
      await this.roundRepository.save(latestRound);
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'P2025') {
        this.logger.warn(
          `Round ${roundId} version conflict during crash, continuing with in-memory events`,
        );
      } else {
        this.logger.error(`Failed to save crashed round: ${error}`);
      }
    }

    await this.settleBets(latestRound);

    await this.redisService.deleteRound(roundId);

    // Publish events from DB version (has authoritative state)
    const events = latestRound.pullEvents();
    if (events.length > 0) {
      await this.eventPublisher.publishBatch(events);
    }

    const crashEvent = events.find((e) => e.eventType === 'RoundCrashed');
    if (crashEvent && 'seed' in crashEvent) {
      this.gamesGateway.broadcastCrash(
        latestRound.id,
        latestRound.getCrashPoint()!,
        crashEvent.seed,
      );
    }

    return latestRound;
  }

  /**
   * Persist bet status changes after crash.
   * Round.crash() mutates bets in-memory (ACTIVE→LOST, PENDING→CANCELLED)
   * but bets are persisted independently via BetRepository.
   */
  private async settleBets(round: Round): Promise<void> {
    const bets = round.getBets();
    const unsettled = bets.filter((b) => b.isLost() || b.isCancelled());

    for (const bet of unsettled) {
      try {
        await this.betRepository.update(bet);
      } catch (error) {
        this.logger.error(
          `Failed to settle bet ${bet.id} (status: ${bet.isLost() ? 'LOST' : 'CANCELLED'}): ${error}`,
        );
      }
    }

    if (unsettled.length > 0) {
      this.logger.log(`Settled ${unsettled.length} bets for round ${round.id}`);
    }
  }
}
