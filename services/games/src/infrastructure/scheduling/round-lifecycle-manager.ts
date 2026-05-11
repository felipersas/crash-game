import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Round, RoundStatus, DEFAULT_ROUND_CONFIG } from '@/domain/entities/round.entity';
import { SeedChain } from '@/domain/value-objects/seed-chain.value-object';
import type { IRoundRepository } from '@/application/interfaces/round.repository';
import type { ISeedChainRepository } from '@/application/interfaces/seed-chain.repository';
import { GamesGateway } from '@/infrastructure/websocket/games.gateway';
import { RedisService } from '@/infrastructure/redis/redis.service';
import type { RoundState } from '@/infrastructure/redis/redis.service';
import {
  ROUND_REPOSITORY,
  GAMES_GATEWAY,
  SEED_CHAIN_REPOSITORY,
} from '@/application/di.tokens';
import type { IRoundStateProvider } from '@/application/interfaces/round-state-provider';
import { OptimisticLockError } from '@/domain/errors/domain.errors';
import { RoundCrashHandler } from './round-crash-handler';
import { PrismaService } from '@/infrastructure/persistence/prisma/prisma.service';
import { OutboxWriter } from '@/infrastructure/messaging/outbox-writer';

/**
 * Round Lifecycle Manager - Infrastructure Layer
 *
 * Orchestrates the round lifecycle:
 * 1. Creates new rounds when needed
 * 2. Transitions from BETTING to ACTIVE phase
 * 3. Updates multiplier during ACTIVE phase
 * 4. Detects crash and delegates to RoundCrashHandler
 * 5. Broadcasts events via WebSocket
 */

@Injectable()
export class RoundLifecycleManager implements IRoundStateProvider {
  private readonly logger = new Logger(RoundLifecycleManager.name);
  private currentRound: Round | null = null;
  private currentSeedChain: SeedChain | null = null;
  private roundStartTime: Date | null = null;
  private updateInterval: NodeJS.Timeout | null = null;
  private bettingEndTimeout: NodeJS.Timeout | null = null;

  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository,
    @Inject(SEED_CHAIN_REPOSITORY) private readonly seedChainRepository: ISeedChainRepository,
    @Inject(GAMES_GATEWAY) private readonly gamesGateway: GamesGateway,
    private readonly redisService: RedisService,
    private readonly crashHandler: RoundCrashHandler,
    private readonly prisma: PrismaService,
    private readonly outboxWriter: OutboxWriter,
  ) {}

  /**
   * Initialize the round lifecycle manager.
   * Called when the module initializes.
   */
  async onModuleInit() {
    this.currentSeedChain = await this.seedChainRepository.load();

    if (!this.currentSeedChain) {
      this.logger.log('No seed chain found, generating new chain...');
      this.currentSeedChain = await SeedChain.generate(1000, process.env.DETERMINISTIC_SEED);
      await this.seedChainRepository.save(this.currentSeedChain);

      const summary = this.currentSeedChain.getSummary();
      this.logger.log(
        `New seed chain created: ${summary.total} seeds, ` +
          `commitment: ${summary.commitment.substring(0, 16)}...`,
      );
    } else {
      const summary = this.currentSeedChain.getSummary();
      this.logger.log(
        `Seed chain loaded: ${summary.remaining}/${summary.total} seeds remaining, ` +
          `position: ${summary.currentPosition}`,
      );

      // Check if chain needs regeneration
      if (this.currentSeedChain.needsRegeneration()) {
        this.logger.warn('Seed chain running low, consider regeneration');
      }
    }

    this.currentRound = await this.roundRepository.findCurrentRound();

    if (!this.currentRound) {
      await this.createNewRound();
    } else {
      this.logger.log(`Resumed existing round: ${this.currentRound.id}`);
      this.resumeRound();
    }
  }

  /**
   * Create a new round using the current seed from the chain.
   */
  async createNewRound() {
    this.logger.log('Creating new round...');

    if (!this.currentSeedChain) {
      throw new Error('Seed chain not initialized');
    }

    // Check if chain needs regeneration
    if (this.currentSeedChain.needsRegeneration()) {
      this.logger.warn('Seed chain running low, regenerating...');
      this.currentSeedChain = await SeedChain.generate(1000, process.env.DETERMINISTIC_SEED);
      await this.seedChainRepository.save(this.currentSeedChain);

      const summary = this.currentSeedChain.getSummary();
      this.logger.log(
        `New seed chain generated: ${summary.total} seeds, ` +
          `commitment: ${summary.commitment.substring(0, 16)}...`,
      );
    }

    const newRound = await Round.createWithSeedChain(this.currentSeedChain, DEFAULT_ROUND_CONFIG);

    const events = newRound.pullEvents();
    let outboxIds: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      await this.roundRepository.create(newRound, tx);
      if (events.length > 0) {
        outboxIds = await this.outboxWriter.writeWithinTransaction(tx, newRound.id, events);
      }
    });

    // Best-effort immediate publish for low latency
    if (events.length > 0 && outboxIds.length > 0) {
      await this.outboxWriter.tryImmediatePublish(events, outboxIds);
    }

    try {
      this.currentSeedChain = this.currentSeedChain.advance();
      await this.seedChainRepository.save(this.currentSeedChain);
    } catch (error) {
      this.logger.error(
        `Failed to advance seed chain: ${error instanceof Error ? error.message : error}`,
      );
    }

    this.currentRound = newRound;

    const roundStarted = events.find((e) => e.eventType === 'RoundStarted');
    if (roundStarted && this.currentRound) {
      this.gamesGateway.broadcastRoundStarted(
        this.currentRound.id,
        this.currentRound.getSeedHash(),
        this.currentRound.getBettingEndTime()!,
      );
    }

    this.scheduleBettingEnd();

    this.logger.log(`Round ${this.currentRound.id} started in BETTING phase`);
  }

  /**
   * Resume an existing round (after server restart).
   */
  private async resumeRound() {
    if (!this.currentRound) return;

    const status = this.currentRound.getStatus();

    if (status === RoundStatus.CRASHED) {
      // Round crashed while server was down - create new round immediately
      this.logger.log(`Current round ${this.currentRound.id} is CRASHED, creating new round`);
      await this.createNewRound();
    } else if (status === RoundStatus.BETTING) {
      // Check if betting phase should have ended
      const bettingEndTime = this.currentRound.getBettingEndTime();
      if (bettingEndTime && bettingEndTime < new Date()) {
        this.endBettingPhase();
      } else {
        this.scheduleBettingEnd();
      }
    } else if (status === RoundStatus.ACTIVE) {
      // Resume active round
      this.roundStartTime = this.currentRound.getStartedAt() || new Date();
      this.startMultiplierUpdates();
    }
  }

  /**
   * Schedule the transition from BETTING to ACTIVE.
   */
  private scheduleBettingEnd() {
    const bettingEndTime = this.currentRound?.getBettingEndTime();
    if (!bettingEndTime) return;

    const delay = bettingEndTime.getTime() - Date.now();
    if (delay <= 0) {
      this.endBettingPhase();
      return;
    }

    this.bettingEndTimeout = setTimeout(() => {
      this.endBettingPhase();
    }, delay);
  }

  /**
   * End the betting phase and start the round.
   * Handles optimistic locking conflicts gracefully.
   */
  private async endBettingPhase() {
    if (!this.currentRound) return;

    this.logger.log(`Ending betting phase for round ${this.currentRound.id}`);

    try {
      await this.currentRound.startRound();
      const events = this.currentRound.pullEvents();
      let outboxIds: string[] = [];
      await this.prisma.$transaction(async (tx) => {
        await this.roundRepository.save(this.currentRound!, tx);
        if (events.length > 0) {
          outboxIds = await this.outboxWriter.writeWithinTransaction(tx, this.currentRound!.id, events);
        }
      });

      // Best-effort immediate publish for low latency
      if (events.length > 0 && outboxIds.length > 0) {
        await this.outboxWriter.tryImmediatePublish(events, outboxIds);
      }
    } catch (error) {
      if (error instanceof OptimisticLockError) {
        this.logger.warn(
          `Optimistic lock conflict for round ${this.currentRound.id}, reloading from database`,
        );

        const reloaded = await this.roundRepository.findById(this.currentRound.id);
        if (!reloaded) {
          this.logger.error(`Round ${this.currentRound.id} not found after conflict`);
          return;
        }

        this.currentRound = reloaded;

        if (reloaded.getStatus() === RoundStatus.ACTIVE) {
          this.logger.log(`Round ${this.currentRound.id} already transitioned to ACTIVE`);
          this.roundStartTime = reloaded.getStartedAt() || new Date();
          this.startMultiplierUpdates();
          return;
        }

        if (reloaded.getStatus() === RoundStatus.BETTING) {
          this.logger.log(`Retrying transition for round ${this.currentRound.id}`);
          await reloaded.startRound();
          const retryEvents = reloaded.pullEvents();
          let retryOutboxIds: string[] = [];
          await this.prisma.$transaction(async (tx) => {
            await this.roundRepository.save(reloaded, tx);
            if (retryEvents.length > 0) {
              retryOutboxIds = await this.outboxWriter.writeWithinTransaction(tx, reloaded.id, retryEvents);
            }
          });

          // Best-effort immediate publish for low latency
          if (retryEvents.length > 0 && retryOutboxIds.length > 0) {
            await this.outboxWriter.tryImmediatePublish(retryEvents, retryOutboxIds);
          }

          this.currentRound = reloaded;
        }
      } else {
        throw error;
      }
    }

    this.gamesGateway.broadcastBettingEnded(this.currentRound.id);

    this.roundStartTime = this.currentRound.getStartedAt() || new Date();
    this.startMultiplierUpdates();
  }

  /**
   * Start periodic multiplier updates during ACTIVE phase.
   */
  private startMultiplierUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    // Update every 100ms (10 times per second)
    this.updateInterval = setInterval(() => {
      this.updateMultiplier();
    }, 100);
  }

  /**
   * Update the multiplier based on elapsed time.
   */
  private updateMultiplier() {
    if (!this.currentRound || !this.roundStartTime) return;

    const elapsedSeconds = (Date.now() - this.roundStartTime.getTime()) / 1000;
    this.currentRound.updateMultiplier(elapsedSeconds);

    this.persistToRedis();

    this.gamesGateway.broadcastMultiplierUpdate(
      this.currentRound.id,
      this.currentRound.getCurrentMultiplier(),
    );

    if (this.currentRound.getStatus() === RoundStatus.CRASHED) {
      this.handleRoundCrashed();
    }
  }

  /**
   * Persist current round state to Redis.
   * Called on every multiplier update (every 100ms).
   */
  private persistToRedis(): void {
    if (!this.currentRound) return;

    const roundState: RoundState = {
      id: this.currentRound.id,
      status: this.currentRound.getStatus(),
      crashPoint: this.currentRound.getCrashPoint(),
      currentMultiplier: this.currentRound.getCurrentMultiplier(),
      bettingEndTime: this.currentRound.getBettingEndTime()?.toISOString() || null,
      startedAt: this.currentRound.getStartedAt()?.toISOString() || null,
      crashedAt: this.currentRound.getCrashedAt()?.toISOString() || null,
      version: this.currentRound.getVersion(),
      lastUpdatedAt: Date.now(),
    };

    this.redisService.setCurrentRound(this.currentRound.id, roundState).catch((error) => {
      this.logger.warn(`Failed to persist to Redis: ${error}`);
    });
  }

  /**
   * Handle round crashed — delegates to RoundCrashHandler.
   */
  private async handleRoundCrashed() {
    if (!this.currentRound) return;

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    this.currentRound = await this.crashHandler.handleRoundCrashed(this.currentRound);

    setTimeout(() => {
      this.createNewRound();
    }, 5000); // 5 second delay before next round
  }

  /**
   * Tick method called every second for monitoring.
   */
  @Cron('* * * * * *', {
    name: 'round-ticker',
  })
  private tick() {
    if (!this.currentRound) return;

    const status = this.currentRound.getStatus();

    this.logger.debug(
      `Round ${this.currentRound.id}: ${status}, ` +
        `Multiplier: ${this.currentRound.getCurrentMultiplier().toFixed(2)}x, ` +
        `Bets: ${this.currentRound.getBets().length}`,
    );
  }

  /**
   * Get the current round.
   */
  getCurrentRound(): Round | null {
    return this.currentRound;
  }

  /**
   * Cleanup on module destroy.
   */
  onModuleDestroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    if (this.bettingEndTimeout) {
      clearTimeout(this.bettingEndTimeout);
    }
  }
}
