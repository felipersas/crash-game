import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Round, RoundStatus, DEFAULT_ROUND_CONFIG } from '@/domain/entities/round.entity';
import { SeedChain } from '@/domain/value-objects/seed-chain.value-object';
import type { IRoundRepository } from '@/application/interfaces/round.repository';
import type { ISeedChainRepository } from '@/application/interfaces/seed-chain.repository';
import { GamesGateway } from '@/infrastructure/websocket/games.gateway';
import {
  ROUND_REPOSITORY,
  GAMES_GATEWAY,
  SEED_CHAIN_REPOSITORY,
  AUTO_CASHOUT_REPOSITORY,
  ROUND_CACHE_REPOSITORY,
} from '@/application/di.tokens';
import type { IAutoCashOutRepository } from '@/application/interfaces/auto-cashout.repository';
import type { RoundCacheRepository } from '@/infrastructure/redis/round-cache.repository';
import type { IRoundStateProvider } from '@/application/interfaces/round-state-provider';
import { CreateRoundUseCase } from '@/application/use-cases/create-round.use-case';
import { StartRoundUseCase } from '@/application/use-cases/start-round.use-case';
import { CrashRoundUseCase } from '@/application/use-cases/crash-round.use-case';

/**
 * Round Lifecycle Manager - Infrastructure Layer
 *
 * Thin orchestrator for the round lifecycle:
 * 1. Creates new rounds (delegates persistence to CreateRoundUseCase)
 * 2. Transitions BETTING → ACTIVE (delegates to StartRoundUseCase)
 * 3. Updates multiplier during ACTIVE phase
 * 4. Detects crash and delegates to CrashRoundUseCase
 * 5. Broadcasts multiplier updates via WebSocket
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
    private readonly createRoundUseCase: CreateRoundUseCase,
    private readonly startRoundUseCase: StartRoundUseCase,
    private readonly crashRoundUseCase: CrashRoundUseCase,
    @Inject(AUTO_CASHOUT_REPOSITORY) private readonly autoCashOutRepo: IAutoCashOutRepository,
    @Inject(ROUND_CACHE_REPOSITORY) private readonly roundCacheRepo: RoundCacheRepository,
    @InjectQueue('cashout') private readonly cashoutQueue: Queue,
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

    const { round } = await this.createRoundUseCase.execute({ round: newRound });

    try {
      this.currentSeedChain = this.currentSeedChain.advance();
      await this.seedChainRepository.save(this.currentSeedChain);
    } catch (error) {
      this.logger.error(
        `Failed to advance seed chain: ${error instanceof Error ? error.message : error}`,
      );
    }

    this.currentRound = round;

    try {
      await this.roundCacheRepo.setCurrentRound({
        roundId: round.id,
        status: 'betting',
        multiplier: 1.0,
      });
    } catch (error) {
      this.logger.error('Failed to set round cache on new round', error);
    }

    this.scheduleBettingEnd();

    this.logger.log(`Round ${round.id} started in BETTING phase`);
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
   * Delegates to StartRoundUseCase which handles optimistic lock conflicts.
   */
  private async endBettingPhase() {
    if (!this.currentRound) return;

    this.logger.log(`Ending betting phase for round ${this.currentRound.id}`);

    const result = await this.startRoundUseCase.execute({ round: this.currentRound });

    this.currentRound = result.round;
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
  private async updateMultiplier() {
    if (!this.currentRound || !this.roundStartTime) return;

    const elapsedSeconds = (Date.now() - this.roundStartTime.getTime()) / 1000;
    this.currentRound.updateMultiplier(elapsedSeconds);

    const currentMultiplier = this.currentRound.getCurrentMultiplier();

    // Update Redis round cache
    try {
      await this.roundCacheRepo.setCurrentRound({
        roundId: this.currentRound.id,
        status: 'active',
        multiplier: currentMultiplier,
      });
    } catch (error) {
      this.logger.error('Failed to update round cache', error);
    }

    // Process auto cash-outs via Lua script
    try {
      const eligible = await this.autoCashOutRepo.fetchAndRemoveEligible(
        this.currentRound.id,
        currentMultiplier,
      );

      if (eligible.length > 0) {
        await this.processAutoCashOuts(eligible);
      }
    } catch (error) {
      this.logger.error('Failed to process auto cash-outs', error);
    }

    this.gamesGateway.broadcastMultiplierUpdate(this.currentRound.id, currentMultiplier);

    if (this.currentRound.getStatus() === RoundStatus.CRASHED) {
      this.handleRoundCrashed();
    }
  }

  /**
   * Process auto cash-outs for eligible players by dispatching BullMQ jobs.
   */
  private async processAutoCashOuts(
    eligible: Array<{ playerId: string; targetMultiplier: number }>,
  ): Promise<void> {
    if (!this.currentRound) return;

    const jobs = eligible.map(({ playerId, targetMultiplier }) => ({
      name: 'auto-cashout',
      data: {
        playerId,
        roundId: this.currentRound!.id,
        targetMultiplier,
        idempotencyKey: this.deterministicUUID(this.currentRound!.id, playerId),
      },
      opts: {
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 500 },
        removeOnComplete: 100,
        removeOnFail: { age: 3600, count: 50 },
      },
    }));

    await this.cashoutQueue.addBulk(jobs);
    this.logger.log(
      `Dispatched ${jobs.length} auto cash-out job(s) for round ${this.currentRound.id}`,
    );
  }

  /**
   * Handle round crashed — delegates to CrashRoundUseCase.
   */
  private async handleRoundCrashed() {
    if (!this.currentRound) return;

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    const { round } = await this.crashRoundUseCase.execute({ round: this.currentRound });

    this.currentRound = round;

    try {
      await this.autoCashOutRepo.clearRound(round.id);
      await this.roundCacheRepo.clearCurrentRound();
    } catch (error) {
      this.logger.error('Failed to clear Redis keys on crash', error);
    }

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

  /**
   * Generate a deterministic UUID v4 from input strings.
   * Same inputs always produce the same UUID.
   */
  private deterministicUUID(...inputs: string[]): string {
    const hex = createHash('sha256').update(inputs.join(':')).digest('hex');
    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      '4' + hex.slice(13, 16),
      ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 20),
      hex.slice(20, 32),
    ].join('-');
  }
}
