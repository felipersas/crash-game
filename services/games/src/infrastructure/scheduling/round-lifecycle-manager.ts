import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Round, RoundStatus, DEFAULT_ROUND_CONFIG } from '@/domain/entities/round.entity';
import type { IRoundRepository } from '@/application/interfaces/round.repository';
import type { IGameEventPublisher } from '@/application/interfaces/event-publisher';
import { GamesGateway } from '@/infrastructure/websocket/games.gateway';
import { ROUND_REPOSITORY, EVENT_PUBLISHER, GAMES_GATEWAY } from '@/infrastructure/di/tokens';

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
  private roundStartTime: Date | null = null;
  private updateInterval: NodeJS.Timeout | null = null;

  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepository: IRoundRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IGameEventPublisher,
    @Inject(GAMES_GATEWAY) private readonly gamesGateway: GamesGateway,
  ) {}

  /**
   * Initialize the round lifecycle manager.
   * Called when the module initializes.
   */
  async onModuleInit() {
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
   * Create a new round.
   */
  async createNewRound() {
    this.logger.log('Creating new round...');

    this.currentRound = await Round.create(DEFAULT_ROUND_CONFIG);
    await this.roundRepository.create(this.currentRound);

    // Publish events
    const events = this.currentRound.pullEvents();
    if (events.length > 0) {
      await this.eventPublisher.publishBatch(events);
    }

    // Broadcast via WebSocket
    const roundStarted = events.find(e => e.eventType === 'RoundStarted');
    if (roundStarted) {
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
  private resumeRound() {
    if (!this.currentRound) return;

    const status = this.currentRound.getStatus();

    if (status === RoundStatus.BETTING) {
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
   */
  private async endBettingPhase() {
    if (!this.currentRound) return;

    this.logger.log(`Ending betting phase for round ${this.currentRound.id}`);

    await this.currentRound.startRound();
    await this.roundRepository.save(this.currentRound);

    // Publish events
    const events = this.currentRound.pullEvents();
    if (events.length > 0) {
      await this.eventPublisher.publishBatch(events);
    }

    // Broadcast via WebSocket
    this.gamesGateway.broadcastBettingEnded(this.currentRound.id);

    // Start multiplier updates
    this.roundStartTime = new Date();
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
   * Handle round crashed.
   */
  private async handleRoundCrashed() {
    if (!this.currentRound) return;

    this.logger.log(`Round ${this.currentRound.id} crashed at ${this.currentRound.getCrashPoint()}x`);

    // Stop updates
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    await this.roundRepository.save(this.currentRound);

    // Publish events
    const events = this.currentRound.pullEvents();
    if (events.length > 0) {
      await this.eventPublisher.publishBatch(events);
    }

    // Broadcast crash
    const crashEvent = events.find(e => e.eventType === 'RoundCrashed');
    if (crashEvent && 'seed' in crashEvent) {
      this.gamesGateway.broadcastCrash(
        this.currentRound.id,
        this.currentRound.getCrashPoint()!,
        crashEvent.seed,
      );
    }

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
