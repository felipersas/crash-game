import { Bet } from './bet.entity';
import { CrashPoint } from '../value-objects/crash-point.value-object';
import { Multiplier } from '../value-objects/multiplier.value-object';
import { SeedChain } from '../value-objects/seed-chain.value-object';
import { Money, type RoundId, type PlayerId, RoundId as RoundIdVO } from '@crash/domain';
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

/**
 * Plain snapshot of a round, used for persistence and rehydration.
 * Bets are persisted separately by the BetRepository.
 */
export interface RoundSnapshot {
  id: RoundId;
  seed: string;
  seedHash: string;
  status: RoundStatus;
  crashPoint: number | null;
  bettingEndTime: Date | null;
  startedAt: Date | null;
  crashedAt: Date | null;
  version: number;
}

export const DEFAULT_ROUND_CONFIG: RoundConfig = {
  bettingDurationMs: 10000, // 10 seconds
  minBetAmount: Money.fromDecimal('1.00'), // $1.00
  maxBetAmount: Money.fromDecimal('1000.00'), // $1,000.00
  growthRate: 0.06,
};

export class Round {
  readonly id: RoundId;
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

  private constructor(id: RoundId, seedChain: SeedChain, config: RoundConfig) {
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
  }

  /**
   * Set betting end time. Called by factory methods.
   */
  private setBettingEndTime(endTime: Date): void {
    this.bettingEndTime = endTime;

    // Emit RoundStartedEvent with seed hash (commit before reveal)
    this.addEvent(
      createRoundStartedEvent(this.id, this.seedChain.getCurrentSeedHash(), endTime, this.version),
    );
  }

  /**
   * Factory method to create a new round.
   */
  static async create(
    config: RoundConfig = DEFAULT_ROUND_CONFIG,
    deterministicSeed?: string,
  ): Promise<Round> {
    const roundId = RoundIdVO.create();
    const seedChain = await SeedChain.generate(1000, deterministicSeed);
    const round = new Round(roundId, seedChain, config);

    round.setBettingEndTime(new Date(Date.now() + config.bettingDurationMs));

    return round;
  }

  /**
   * Factory method to create a new round with an existing seed chain.
   * Used by RoundLifecycleManager to use pre-generated seeds.
   */
  static async createWithSeedChain(
    seedChain: SeedChain,
    config: RoundConfig = DEFAULT_ROUND_CONFIG,
  ): Promise<Round> {
    const roundId = RoundIdVO.create();
    const round = new Round(roundId, seedChain, config);

    round.setBettingEndTime(new Date(Date.now() + config.bettingDurationMs));

    return round;
  }

  /**
   * Factory method to restore a round from persistence (no events).
   * CANCELLED bets are not part of the aggregate's live state.
   */
  static restore(
    snapshot: RoundSnapshot,
    bets: Bet[],
    config: RoundConfig = DEFAULT_ROUND_CONFIG,
  ): Round {
    const seedChain = SeedChain.fromRoundPersistence({
      currentSeed: snapshot.seed,
      currentHash: snapshot.seedHash,
    });
    const round = new Round(snapshot.id, seedChain, config);

    round.status = snapshot.status;
    round.crashPoint =
      snapshot.crashPoint !== null ? CrashPoint.fromValue(snapshot.crashPoint) : null;
    round.bettingEndTime = snapshot.bettingEndTime;
    round.startedAt = snapshot.startedAt;
    round.crashedAt = snapshot.crashedAt;
    round.version = snapshot.version;

    for (const bet of bets) {
      if (!bet.isCancelled()) {
        round.bets.set(bet.playerId, bet);
      }
    }

    return round;
  }

  /**
   * Place a bet for a player.
   * Only allowed during BETTING phase, once per player.
   */
  placeBet(
    playerId: PlayerId,
    playerName: string,
    amount: Money,
    autoCashOutMultiplier?: number,
  ): Bet {
    this.assertAcceptsBet(amount);

    if (this.bets.has(playerId)) {
      throw new DuplicateBetError();
    }

    const bet = Bet.create(this.id, playerId, playerName, amount, autoCashOutMultiplier);
    this.registerBet(bet);
    return bet;
  }

  /**
   * Place a bet, replacing any existing PENDING or CANCELLED bet.
   * Domain rule: a player may retry a bet if the previous one is PENDING
   * (wallet not yet confirmed) or CANCELLED (wallet rejected).
   * Returns the new bet and the replaced bet (if any, needs persistence).
   */
  placeOrReplaceBet(
    playerId: PlayerId,
    playerName: string,
    amount: Money,
    autoCashOutMultiplier?: number,
  ): { bet: Bet; replacedBet: Bet | null } {
    this.assertAcceptsBet(amount);

    const existing = this.bets.get(playerId);
    if (existing && !existing.isPending() && !existing.isCancelled()) {
      throw new DuplicateBetError();
    }

    // Create the new bet first so invalid input never cancels the existing one
    const bet = Bet.create(this.id, playerId, playerName, amount, autoCashOutMultiplier);

    let replacedBet: Bet | null = null;
    if (existing?.isPending()) {
      existing.cancel('Replaced by new bet attempt');
      // The replaced bet leaves the aggregate, so keep its events in the root buffer
      this.events.push(...existing.pullEvents());
      replacedBet = existing;
    }

    this.registerBet(bet);
    return { bet, replacedBet };
  }

  private assertAcceptsBet(amount: Money): void {
    if (this.status !== RoundStatus.BETTING) {
      throw new RoundNotAcceptingBetsError();
    }
    if (amount.isLessThan(this.config.minBetAmount)) {
      throw new BetBelowMinimumError(amount, this.config.minBetAmount);
    }
    if (amount.isGreaterThan(this.config.maxBetAmount)) {
      throw new BetAboveMaximumError(amount, this.config.maxBetAmount);
    }
  }

  private registerBet(bet: Bet): void {
    this.bets.set(bet.playerId, bet);
    this.addEvent(
      createBetPlacedEvent(this.id, bet.id, bet.playerId, bet.getAmount().toCents(), this.version),
    );
  }

  /**
   * Cash out a player's bet at the current multiplier, or at the given
   * multiplier when an auto cash-out target was reached.
   * Only allowed during ACTIVE phase.
   */
  cashOut(playerId: PlayerId, overrideMultiplier?: Multiplier): Money {
    if (this.status === RoundStatus.CRASHED) {
      throw new RoundAlreadyCrashedError(this.crashPoint!.getValue());
    }
    if (this.status !== RoundStatus.ACTIVE) {
      throw new InvalidRoundStateError(this.status, 'cash out');
    }

    const bet = this.bets.get(playerId);
    if (!bet || !bet.isActive()) {
      throw new NoActiveBetError();
    }

    const multiplier = overrideMultiplier ?? this.currentMultiplier;
    const payout = bet.cashOut(multiplier);

    this.addEvent(
      createPlayerCashedOutEvent(
        this.id,
        bet.id,
        playerId,
        bet.getAmount().toCents(),
        multiplier.getValue(),
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

    if (this.crashPoint?.shouldCrashAt(this.currentMultiplier.getValue())) {
      this.crash();
    }
  }

  /**
   * Crash the round: active bets are lost, unconfirmed (PENDING) bets are cancelled.
   * Normally triggered by updateMultiplier() reaching the crash point; also called
   * when reconciling a persisted copy of a round whose live instance already crashed.
   */
  crash(): void {
    if (this.status !== RoundStatus.ACTIVE) {
      throw new InvalidRoundStateError(this.status, 'crash');
    }

    this.version++;
    this.status = RoundStatus.CRASHED;
    this.crashedAt = new Date();

    // Mark active bets as lost, cancel PENDING bets (wallet may not have debited yet)
    for (const bet of this.bets.values()) {
      if (bet.isActive()) {
        bet.markAsLost();
      } else if (bet.isPending()) {
        bet.cancel('Round crashed before wallet confirmation');
      }
    }

    const bets = this.getBets().filter((bet) => !bet.isCancelled());
    const totalWinAmount = bets
      .filter((bet) => bet.isCashedOut())
      .reduce((sum, bet) => sum + bet.getProfitCents(), 0n);

    this.addEvent(
      createRoundCrashedEvent(
        this.id,
        this.crashPoint!.getValue(),
        this.seedChain.getSeed(),
        bets.length,
        this.getTotalWagered().toCents(),
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
    return this.crashPoint?.getValue() ?? null;
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
  getBetByPlayer(playerId: PlayerId): Bet | undefined {
    return this.bets.get(playerId);
  }

  /**
   * Total amount wagered on this round (cancelled bets excluded).
   */
  getTotalWagered(): Money {
    return this.getBets()
      .filter((bet) => !bet.isCancelled())
      .reduce((sum, bet) => sum.add(bet.getAmount()), Money.zero());
  }

  /**
   * Upsert a bet loaded from persistence into this in-memory aggregate.
   * Needed because the lifecycle manager's live round is a separate instance
   * from the rounds use cases load from the database; the persisted bet is
   * authoritative.
   */
  syncBet(bet: Bet): void {
    if (!bet.isCancelled()) {
      this.bets.set(bet.playerId, bet);
    }
  }

  /**
   * Get the round version for optimistic locking.
   */
  getVersion(): number {
    return this.version;
  }

  /**
   * Pull all pending domain events (including those raised by bets in this
   * round) and clear the internal buffers.
   */
  pullEvents(): GameDomainEvent[] {
    const events = [...this.events, ...this.getBets().flatMap((bet) => bet.pullEvents())];
    this.events = [];
    return events;
  }

  /**
   * Add a domain event to the internal buffer.
   */
  private addEvent(event: GameDomainEvent): void {
    this.events.push(event);
  }

  /**
   * Convert to plain object for persistence.
   * The seed is persisted so the crash point can be recomputed after a restart;
   * it is only exposed through the API once the round has crashed (see getSeed()).
   * Bets are managed separately by BetRepository.
   */
  toPersistence(): RoundSnapshot {
    return {
      id: this.id,
      seed: this.seedChain.getSeed(),
      seedHash: this.seedChain.getCurrentSeedHash(),
      status: this.status,
      crashPoint: this.crashPoint?.getValue() ?? null,
      bettingEndTime: this.bettingEndTime,
      startedAt: this.startedAt,
      crashedAt: this.crashedAt,
      version: this.version,
    };
  }
}
