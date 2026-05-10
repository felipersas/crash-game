import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Round, RoundStatus, DEFAULT_ROUND_CONFIG } from '@/domain/entities/round.entity';
import { SeedChain } from '@/domain/value-objects/seed-chain.value-object';
import type { IRoundRepository } from '@/application/interfaces/round.repository';
import type { IGameEventPublisher } from '@/application/interfaces/event-publisher';
import type { ISeedChainRepository } from '@/application/interfaces/seed-chain.repository';
import { GamesGateway } from '@/infrastructure/websocket/games.gateway';
import { RedisService, type RoundState } from '@/infrastructure/redis/redis.service';
import { ROUND_REPOSITORY, BET_REPOSITORY, EVENT_PUBLISHER, GAMES_GATEWAY, SEED_CHAIN_REPOSITORY } from '@/infrastructure/di/tokens';
import type { IBetRepository } from '@/application/interfaces/bet.repository';
import { OptimisticLockError } from '@/domain/errors/domain.errors';

/**
 * Round Lifecycle Manager - Infrastructure Layer
 *
 * Orchestrates the round lifecycle:
 * 1. Creates new rounds when needed
 * 2. Transitions from BETTING to ACTIVE phase
 * 3. Updates multiplier during ACTIVE phase
 * 4. Detects crash and ends round
 * 5. Broadcasts events via WebSocket
 */

@Injectable()
export class RoundLifecycleManager {
  private readonly logger = new Logger(RoundLifecycleManager.name);
  private currentRound: Round | null = null;
  private currentSeedChain: SeedChain | null = null;
  private roundStartTime: Date | null = null;
  private updateInterval: NodeJS.Timeout | null = null;

  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository,
    @Inject(BET_REPOSITORY) private readonly betRepository: IBetRepository,
    @Inject(SEED_CHAIN_REPOSITORY) private readonly seedChainRepository: ISeedChainRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IGameEventPublisher,
    @Inject(GAMES_GATEWAY) private readonly gamesGateway: GamesGateway,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Initialize the round lifecycle manager.
   * Called when the module initializes.
   */
  async onModuleInit() {
    // Load or create seed chain
    this.currentSeedChain = await this.seedChainRepository.load();

    if (!this.currentSeedChain) {
      this.logger.log('No seed chain found, generating new chain...');
      this.currentSeedChain = await SeedChain.generate(1000);
      await this.seedChainRepository.save(this.currentSeedChain);

      const summary = this.currentSeedChain.getSummary();
      this.logger.log(
        `New seed chain created: ${summary.total} seeds, ` +
        `commitment: ${summary.commitment.substring(0, 16)}...`
      );
    } else {
      const summary = this.currentSeedChain.getSummary();
      this.logger.log(
        `Seed chain loaded: ${summary.remaining}/${summary.total} seeds remaining, ` +
        `position: ${summary.currentPosition}`
      );

      // Check if chain needs regeneration
      if (this.currentSeedChain.needsRegeneration()) {
        this.logger.warn('Seed chain running low, consider regeneration');
      }
    }

    // Try to load existing current round
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
      this.currentSeedChain = await SeedChain.generate(1000);
      await this.seedChainRepository.save(this.currentSeedChain);

      const summary = this.currentSeedChain.getSummary();
      this.logger.log(
        `New seed chain generated: ${summary.total} seeds, ` +
        `commitment: ${summary.commitment.substring(0, 16)}...`
      );
    }

    // Create round with current seed from chain
    const newRound = await Round.createWithSeedChain(
      this.currentSeedChain,
      DEFAULT_ROUND_CONFIG,
    );
    await this.roundRepository.create(newRound);

    // Advance to next seed for next round
    try {
      this.currentSeedChain = this.currentSeedChain.advance();
      await this.seedChainRepository.save(this.currentSeedChain);
    } catch (error) {
      this.logger.error(`Failed to advance seed chain: ${error instanceof Error ? error.message : error}`);
    }

    this.currentRound = newRound;

    // Publish events
    const events = this.currentRound.pullEvents();
    if (events.length > 0) {
      await this.eventPublisher.publishBatch(events);
    }

    // Broadcast via WebSocket
    const roundStarted = events.find(e => e.eventType === 'RoundStarted');
    if (roundStarted && this.currentRound) {
      this.gamesGateway.broadcastRoundStarted(
        this.currentRound.id,
        this.currentRound.getSeedHash(),
        this.currentRound.getBettingEndTime()!,
      );
    }

    // Schedule end of betting phase
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

    const timeout = setTimeout(() => {
      this.endBettingPhase();
    }, delay);

    // Store timeout for cleanup if needed
    (this as any).bettingEndTimeout = timeout;
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
      await this.roundRepository.save(this.currentRound);
    } catch (error) {
      if (error instanceof OptimisticLockError) {
        // Handle optimistic lock conflict - reload the round from the database
        this.logger.warn(
          `Optimistic lock conflict for round ${this.currentRound.id}, reloading from database`
        );

        const reloaded = await this.roundRepository.findById(this.currentRound.id);
        if (!reloaded) {
          this.logger.error(`Round ${this.currentRound.id} not found after conflict`);
          return;
        }

        // Update the current round with the reloaded state
        this.currentRound = reloaded;

        // If the round was already transitioned to ACTIVE by another instance, resume normally
        if (reloaded.getStatus() === RoundStatus.ACTIVE) {
          this.logger.log(`Round ${this.currentRound.id} already transitioned to ACTIVE`);
          this.roundStartTime = reloaded.getStartedAt() || new Date();
          this.startMultiplierUpdates();
          return;
        }

        // If still in BETTING phase, retry the transition once
        if (reloaded.getStatus() === RoundStatus.BETTING) {
          this.logger.log(`Retrying transition for round ${this.currentRound.id}`);
          await reloaded.startRound();
          await this.roundRepository.save(reloaded);
          this.currentRound = reloaded;
        }
      } else {
        throw error;
      }
    }

    // Publish events
    const events = this.currentRound.pullEvents();
    if (events.length > 0) {
      await this.eventPublisher.publishBatch(events);
    }

    // Broadcast via WebSocket
    this.gamesGateway.broadcastBettingEnded(this.currentRound.id);

    // Start multiplier updates
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

    // Persist to Redis for fast access (sub-ms reads for cashout)
    this.persistToRedis();

    // Broadcast multiplier update
    this.gamesGateway.broadcastMultiplierUpdate(
      this.currentRound.id,
      this.currentRound.getCurrentMultiplier(),
    );

    // Check if round crashed
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

    // Fire and forget - Redis errors are logged in the service
    this.redisService.setCurrentRound(this.currentRound.id, roundState).catch((error) => {
      this.logger.warn(`Failed to persist to Redis: ${error}`);
    });
  }

  /**
   * Handle round crashed.
   *
   * IMPORTANT: Reloads Round from DB before saving to handle race conditions
   * where cashouts occurred via API (which updates the Round independently).
   * This ensures we have the latest version with all cashouts applied.
   */
  private async handleRoundCrashed() {
    if (!this.currentRound) return;

    const roundId = this.currentRound.id;
    const crashPoint = this.currentRound.getCrashPoint();

    this.logger.log(`Round ${roundId} crashed at ${crashPoint}x`);

    // Stop updates
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    // Reload Round from DB to get latest version (may have cashouts from API)
    const latestRound = await this.roundRepository.findById(roundId);
    if (!latestRound) {
      this.logger.error(`Round ${roundId} not found in DB during crash handling`);
      await this.redisService.deleteRound(roundId);
      this.createNewRound();
      return;
    }

    // The crash was already determined in-memory, but we need to apply it
    // to the DB version which has all the cashouts
    // Trigger crash by updating multiplier to crash point
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
        this.logger.warn(`Round ${roundId} version conflict during crash, continuing with in-memory events`);
        // Continue - crash was determined correctly in-memory
      } else {
        this.logger.error(`Failed to save crashed round: ${error}`);
      }
    }

    // Persist bet status changes (LOST/CANCELLED) to DB
    await this.settleBets(latestRound);

    // Clear from Redis (round is over)
    await this.redisService.deleteRound(roundId);

    // Publish events from DB version (has authoritative state)
    const events = latestRound.pullEvents();
    if (events.length > 0) {
      await this.eventPublisher.publishBatch(events);
    }

    // Broadcast crash
    const crashEvent = events.find(e => e.eventType === 'RoundCrashed');
    if (crashEvent && 'seed' in crashEvent) {
      this.gamesGateway.broadcastCrash(
        latestRound.id,
        latestRound.getCrashPoint()!,
        crashEvent.seed,
      );
    }

    // Update our reference and start new round
    this.currentRound = latestRound;

    // Start new round after a delay
    setTimeout(() => {
      this.createNewRound();
    }, 5000); // 5 second delay before next round
  }

  /**
   * Start the ticker that runs every second to check round state.
   */
  /**
   * Tick method called every second.
   */
  @Cron('* * * * * *', {
    name: 'round-ticker',
  })
  private tick() {
    if (!this.currentRound) return;

    const status = this.currentRound.getStatus();

    // Log current state
    this.logger.debug(
      `Round ${this.currentRound.id}: ${status}, ` +
      `Multiplier: ${this.currentRound.getCurrentMultiplier().toFixed(2)}x, ` +
      `Bets: ${this.currentRound.getBets().length}`
    );
  }

  /**
   * Persist bet status changes after crash.
   * Round.crash() mutates bets in-memory (ACTIVE→LOST, PENDING→CANCELLED)
   * but bets are persisted independently via BetRepository.
   */
  private async settleBets(round: Round): Promise<void> {
    const bets = round.getBets();
    const unsettled = bets.filter(b => b.isLost() || b.isCancelled());

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

    const bettingEndTimeout = (this as any).bettingEndTimeout;
    if (bettingEndTimeout) {
      clearTimeout(bettingEndTimeout);
    }
  }
}
