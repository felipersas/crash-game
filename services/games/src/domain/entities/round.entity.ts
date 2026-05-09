import { Bet } from './bet.entity';
import { CrashPoint } from '../value-objects/crash-point.value-object';
import { Multiplier } from '../value-objects/multiplier.value-object';
import { SeedChain } from '../value-objects/seed-chain.value-object';
import { Money } from '@crash/domain';
import {
  RoundNotAcceptingBetsError,
  DuplicateBetError,
  NoActiveBetError,
  RoundAlreadyCrashedError,
  BetBelowMinimumError,
  BetAboveMaximumError,
  InvalidRoundStateError,
  SeedNotAvailableError,
} from '../errors/domain.errors';
import type { GameDomainEvent } from '../events/round.events';
import {
  createRoundStartedEvent,
  createBettingPhaseEndedEvent,
  createBetPlacedEvent,
  createPlayerCashedOutEvent,
  createRoundCrashedEvent,
} from '../events/round.events';

/**
 * Round States
 */
export enum RoundStatus {
  BETTING = 'BETTING', // Accepting bets
  ACTIVE = 'ACTIVE', // Multiplier rising
  CRASHED = 'CRASHED', // Round ended
}

/**
 * Round Entity - Aggregate Root for the Games bounded context.
 *
 * Manages the complete lifecycle of a game round:
 * 1. BETTING phase: Players place bets
 * 2. ACTIVE phase: Multiplier rises, players can cash out
 * 3. CRASHED: Round ends at crash point
 *
 * Uses event sourcing pattern - all state changes emit domain events.
 */

export interface RoundConfig {
  bettingDurationMs: number; // How long betting phase lasts
  minBetAmount: Money; // Minimum bet
  maxBetAmount: Money; // Maximum bet
  growthRate: number; // Multiplier growth rate (default 0.06)
}

export const DEFAULT_ROUND_CONFIG: RoundConfig = {
  bettingDurationMs: 10000, // 10 seconds
  minBetAmount: Money.fromDecimal('1.00'), // $1.00
  maxBetAmount: Money.fromDecimal('1000.00'), // $1,000.00
  growthRate: 0.06,
};

export class Round {
  readonly id: string;
  private status: RoundStatus;
  private seedChain: SeedChain;
  private crashPoint: CrashPoint | null;
  private bettingEndTime: Date | null;
  private startedAt: Date | null;
  private crashedAt: Date | null;
  private bets: Map<string, Bet>; // playerId -> Bet
  private currentMultiplier: Multiplier;
  private version: number;
  private events: GameDomainEvent[];
  private config: RoundConfig;

  private constructor(
    id: string,
    seedChain: SeedChain,
    config: RoundConfig,
  ) {
    this.id = id;
    this.seedChain = seedChain;
    this.config = config;
    this.status = RoundStatus.BETTING;
    this.crashPoint = null;
    this.bettingEndTime = null;
    this.startedAt = null;
    this.crashedAt = null;
    this.bets = new Map();
    this.currentMultiplier = Multiplier.start();
    this.version = 1;
    this.events = [];

    // Emit RoundStartedEvent with seed hash (commit before reveal)
    this.addEvent(
      createRoundStartedEvent(
        id,
        seedChain.getCurrentSeedHash(),
        new Date(Date.now() + config.bettingDurationMs),
        this.version,
      ),
    );
  }

  /**
   * Factory method to create a new round.
   */
  static async create(config: RoundConfig = DEFAULT_ROUND_CONFIG): Promise<Round> {
    const roundId = crypto.randomUUID();
    const seedChain = await SeedChain.generate();
    const round = new Round(roundId, seedChain, config);

    // Set betting end time
    (round as any).bettingEndTime = new Date(Date.now() + config.bettingDurationMs);

    return round;
  }

  /**
   * Factory method to create a new round with an existing seed chain.
   * Used by RoundLifecycleManager to use pre-generated seeds.
   */
  static async createWithSeedChain(seedChain: SeedChain, config: RoundConfig = DEFAULT_ROUND_CONFIG): Promise<Round> {
    const roundId = crypto.randomUUID();
    const round = new Round(roundId, seedChain, config);

    // Set betting end time
    (round as any).bettingEndTime = new Date(Date.now() + config.bettingDurationMs);

    return round;
  }

  /**
   * Factory method to restore a round from persistence.
   */
  static restore(
    id: string,
    seed: string,
    seedHash: string,
    _nextSeed: string | null,
    status: RoundStatus,
    crashPoint: number | null,
    bettingEndTime: Date | null,
    startedAt: Date | null,
    crashedAt: Date | null,
    bets: Bet[],
    version: number,
    config: RoundConfig = DEFAULT_ROUND_CONFIG,
  ): Round {
    const seedChain = SeedChain.fromRoundPersistence({
      currentSeed: seed,
      currentHash: seedHash,
    });
    const round = new Round(id, seedChain, config);

    round.status = status;
    round.crashPoint = crashPoint !== null ? CrashPoint.fromValue(crashPoint) : null;
    round.bettingEndTime = bettingEndTime;
    round.startedAt = startedAt;
    round.crashedAt = crashedAt;
    round.version = version;
    round.currentMultiplier = Multiplier.start();

    for (const bet of bets) {
      round.bets.set(bet.playerId, bet);
    }

    return round;
  }

  /**
   * Place a bet for a player.
   * Only allowed during BETTING phase.
   */
  placeBet(playerId: string, amount: Money): void {
    if (this.status !== RoundStatus.BETTING) {
      throw new RoundNotAcceptingBetsError();
    }

    if (this.bets.has(playerId)) {
      throw new DuplicateBetError();
    }

    if (amount.isLessThan(this.config.minBetAmount)) {
      throw new BetBelowMinimumError(amount.toCents());
    }

    if (amount.isGreaterThan(this.config.maxBetAmount)) {
      throw new BetAboveMaximumError(amount.toCents());
    }

    const bet = Bet.create(this.id, playerId, amount);
    this.bets.set(playerId, bet);

    this.version++;
    this.addEvent(
      createBetPlacedEvent(
        this.id,
        bet.id,
        playerId,
        amount.toCents(),
        this.version,
      ),
    );
  }

  /**
   * Cash out a player's bet at the current multiplier.
   * Only allowed during ACTIVE phase.
   */
  cashOut(playerId: string): Money {
    if (this.status !== RoundStatus.ACTIVE) {
      throw new RoundAlreadyCrashedError(this.crashPoint?.getValue() || 0);
    }

    const bet = this.bets.get(playerId);
    if (!bet || !bet.isActive()) {
      throw new NoActiveBetError();
    }

    const payout = bet.cashOut(this.currentMultiplier);
    this.version++;

    this.addEvent(
      createPlayerCashedOutEvent(
        this.id,
        bet.id,
        playerId,
        bet.getAmount().toCents(),
        this.currentMultiplier.getValue(),
        payout.toCents(),
        this.version,
      ),
    );

    return payout;
  }

  /**
   * End the betting phase and start the round.
   * Calculates crash point from seed.
   */
  async startRound(): Promise<void> {
    if (this.status !== RoundStatus.BETTING) {
      throw new InvalidRoundStateError(this.status, 'start');
    }

    this.version++;
    this.status = RoundStatus.ACTIVE;
    this.startedAt = new Date();

    // Calculate crash point from seed
    this.crashPoint = await CrashPoint.fromSeed(this.seedChain.getSeed());

    this.addEvent(createBettingPhaseEndedEvent(this.id, this.version));
  }

  /**
   * Update the multiplier based on elapsed time.
   * Should be called periodically during ACTIVE phase.
   */
  updateMultiplier(elapsedSeconds: number): void {
    if (this.status !== RoundStatus.ACTIVE) {
      return;
    }

    this.currentMultiplier = Multiplier.afterDuration(elapsedSeconds, this.config.growthRate);

    // Check if round should crash
    if (this.crashPoint && this.crashPoint.shouldCrashAt(this.currentMultiplier.getValue())) {
      this.crash();
    }
  }

  /**
   * Crash the round.
   * Marks all active bets as lost.
   */
  private crash(): void {
    if (this.status !== RoundStatus.ACTIVE) {
      return;
    }

    this.version++;
    this.status = RoundStatus.CRASHED;
    this.crashedAt = new Date();

    // Mark all active bets as lost (PENDING bets are also lost - implicit cancellation)
    for (const bet of this.bets.values()) {
      if (bet.isActive() || bet.isPending()) {
        bet.markAsLost();
      }
    }

    // Calculate totals for the event
    let totalBets = 0;
    let totalBetAmount = 0n;
    let totalWinAmount = 0n;

    for (const bet of this.bets.values()) {
      totalBets++;
      const betAmount = bet.getAmount().toCents();
      totalBetAmount += betAmount;
      if (bet.isCashedOut()) {
        const cashOutAmount = bet.getCashOutAmount()!.toCents();
        totalWinAmount += cashOutAmount - betAmount;
      }
    }

    this.addEvent(
      createRoundCrashedEvent(
        this.id,
        this.crashPoint!.getValue(),
        this.seedChain.getSeed(),
        totalBets,
        totalBetAmount,
        totalWinAmount,
        this.version,
      ),
    );
  }

  /**
   * Get the current status of the round.
   */
  getStatus(): RoundStatus {
    return this.status;
  }

  /**
   * Get the crash point (revealed after crash).
   */
  getCrashPoint(): number | null {
    return this.crashPoint?.getValue() || null;
  }

  /**
   * Get the seed hash (committed before round, revealed after crash).
   */
  getSeedHash(): string {
    return this.seedChain.getCurrentSeedHash();
  }

  /**
   * Get the seed (only available after crash).
   */
  getSeed(): string {
    if (this.status !== RoundStatus.CRASHED) {
      throw new SeedNotAvailableError();
    }
    return this.seedChain.getSeed();
  }

  /**
   * Get the betting end time.
   */
  getBettingEndTime(): Date | null {
    return this.bettingEndTime;
  }

  /**
   * Get the time when the round started (ACTIVE phase began).
   */
  getStartedAt(): Date | null {
    return this.startedAt;
  }

  /**
   * Get the time when the round crashed.
   */
  getCrashedAt(): Date | null {
    return this.crashedAt;
  }

  /**
   * Get the current multiplier.
   */
  getCurrentMultiplier(): number {
    return this.currentMultiplier.getValue();
  }

  /**
   * Get all bets in this round.
   */
  getBets(): Bet[] {
    return Array.from(this.bets.values());
  }

  /**
   * Get a specific bet by player ID.
   */
  getBetByPlayer(playerId: string): Bet | undefined {
    return this.bets.get(playerId);
  }

  /**
   * Get the round version for optimistic locking.
   */
  getVersion(): number {
    return this.version;
  }

  /**
   * Pull all pending domain events and clear the internal buffer.
   */
  pullEvents(): GameDomainEvent[] {
    const events = [...this.events];
    this.events = [];
    return events;
  }

  /**
   * Get count of pending events without clearing.
   */
  getPendingEventsCount(): number {
    return this.events.length;
  }

  /**
   * Add a domain event to the internal buffer.
   */
  private addEvent(event: GameDomainEvent): void {
    this.events.push(event);
  }

  /**
   * Convert to plain object for persistence.
   * NOTE: Seed is only included after round crashes (security).
   * NOTE: Bets are managed separately by BetRepository.
   */
  toPersistence() {
    return {
      id: this.id,
      seed: this.status === RoundStatus.CRASHED ? this.seedChain.getSeed() : null,
      seedHash: this.seedChain.getCurrentSeedHash(),
      nextSeed: null, // Seed chain managed separately
      status: this.status,
      crashPoint: this.crashPoint?.getValue() || null,
      bettingEndTime: this.bettingEndTime,
      startedAt: this.startedAt,
      crashedAt: this.crashedAt,
      version: this.version,
      config: this.config,
    };
  }
}
