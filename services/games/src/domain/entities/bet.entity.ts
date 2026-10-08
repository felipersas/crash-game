import { Multiplier } from '../value-objects/multiplier.value-object';
import { Money, type BetId, type RoundId, type PlayerId, BetId as BetIdVO } from '@crash/domain';
import { InvalidBetStateError, InvalidAutoCashOutMultiplierError } from '../errors/domain.errors';
import {
  createBetCancelledEvent,
  createBetConfirmedEvent,
  type BetCancelledEvent,
  type BetConfirmedEvent,
} from '../events/round.events';

/**
 * Bet lifecycle states (saga pattern).
 * Defined in domain layer to avoid infrastructure dependency.
 */
export enum BetStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  CASHED_OUT = 'CASHED_OUT',
  LOST = 'LOST',
  CANCELLED = 'CANCELLED',
}

export type BetDomainEvent = BetConfirmedEvent | BetCancelledEvent;

/**
 * Plain snapshot of a bet, used for persistence and rehydration.
 */
export interface BetSnapshot {
  id: BetId;
  roundId: RoundId;
  playerId: PlayerId;
  playerName: string;
  amountCents: bigint;
  status: BetStatus;
  autoCashOutMultiplier: number | null;
  cashOutMultiplier: number | null;
  cashOutAmount: bigint | null;
  cashedOutAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
}

export class Bet {
  static readonly MIN_AUTO_CASHOUT_MULTIPLIER = 1.01;
  static readonly MAX_AUTO_CASHOUT_MULTIPLIER = 1000;

  /**
   * Bets are not versioned on their own; their events carry a fixed version
   * and are ordered by the owning round (aggregateId = roundId).
   */
  private static readonly EVENT_VERSION = 1;

  readonly id: BetId;
  readonly roundId: RoundId;
  readonly playerId: PlayerId;
  readonly playerName: string;
  readonly createdAt: Date;
  private readonly amount: Money;
  private readonly autoCashOutMultiplier: number | null;
  private status: BetStatus;
  private cashOutMultiplier: Multiplier | null = null;
  private cashOutAmount: Money | null = null;
  private cashedOutAt: Date | null = null;
  private cancelReason: string | null = null;
  private events: BetDomainEvent[] = [];

  private constructor(props: {
    id: BetId;
    roundId: RoundId;
    playerId: PlayerId;
    playerName: string;
    amount: Money;
    status: BetStatus;
    autoCashOutMultiplier: number | null;
    createdAt: Date;
  }) {
    this.id = props.id;
    this.roundId = props.roundId;
    this.playerId = props.playerId;
    this.playerName = props.playerName;
    this.amount = props.amount;
    this.status = props.status;
    this.autoCashOutMultiplier = props.autoCashOutMultiplier;
    this.createdAt = props.createdAt;
  }

  /**
   * Factory method to create a new bet in PENDING state.
   * The bet will be confirmed once the wallet is debited.
   */
  static create(
    roundId: RoundId,
    playerId: PlayerId,
    playerName: string,
    amount: Money,
    autoCashOutMultiplier?: number,
  ): Bet {
    if (autoCashOutMultiplier !== undefined) {
      Bet.assertValidAutoCashOut(autoCashOutMultiplier);
    }

    return new Bet({
      id: BetIdVO.create(),
      roundId,
      playerId,
      playerName,
      amount,
      status: BetStatus.PENDING,
      autoCashOutMultiplier: autoCashOutMultiplier ?? null,
      createdAt: new Date(),
    });
  }

  /**
   * Factory method to restore a bet from persistence (no events).
   */
  static restore(snapshot: BetSnapshot): Bet {
    const bet = new Bet({
      id: snapshot.id,
      roundId: snapshot.roundId,
      playerId: snapshot.playerId,
      playerName: snapshot.playerName,
      amount: Money.fromCents(snapshot.amountCents),
      status: snapshot.status,
      autoCashOutMultiplier: snapshot.autoCashOutMultiplier,
      createdAt: snapshot.createdAt,
    });

    bet.cashOutMultiplier =
      snapshot.cashOutMultiplier !== null ? Multiplier.fromValue(snapshot.cashOutMultiplier) : null;
    bet.cashOutAmount =
      snapshot.cashOutAmount !== null ? Money.fromCents(snapshot.cashOutAmount) : null;
    bet.cashedOutAt = snapshot.cashedOutAt;
    bet.cancelReason = snapshot.cancelReason;

    return bet;
  }

  private static assertValidAutoCashOut(multiplier: number): void {
    if (multiplier < Bet.MIN_AUTO_CASHOUT_MULTIPLIER) {
      throw new InvalidAutoCashOutMultiplierError(
        multiplier,
        `must be at least ${Bet.MIN_AUTO_CASHOUT_MULTIPLIER}`,
      );
    }
    if (multiplier > Bet.MAX_AUTO_CASHOUT_MULTIPLIER) {
      throw new InvalidAutoCashOutMultiplierError(
        multiplier,
        `must be at most ${Bet.MAX_AUTO_CASHOUT_MULTIPLIER}`,
      );
    }
  }

  /**
   * Confirm the bet after successful wallet debit.
   * Transition from PENDING to ACTIVE.
   */
  confirm(): void {
    if (this.status !== BetStatus.PENDING) {
      throw new InvalidBetStateError(this.status, 'confirm');
    }

    this.status = BetStatus.ACTIVE;

    this.events.push(
      createBetConfirmedEvent(
        this.roundId,
        this.id,
        this.playerId,
        this.amount.toCents(),
        Bet.EVENT_VERSION,
      ),
    );
  }

  /**
   * Cancel the bet (wallet debit failure, timeout, replacement or round crash).
   * Transition from PENDING to CANCELLED.
   */
  cancel(reason: string): void {
    if (this.status !== BetStatus.PENDING) {
      throw new InvalidBetStateError(this.status, 'cancel');
    }

    this.status = BetStatus.CANCELLED;
    this.cancelReason = reason;

    this.events.push(
      createBetCancelledEvent(
        this.roundId,
        this.id,
        this.playerId,
        this.amount.toCents(),
        reason,
        Bet.EVENT_VERSION,
      ),
    );
  }

  /**
   * Cash out the bet at the given multiplier.
   * Only allowed if bet is ACTIVE (confirmed by wallet).
   */
  cashOut(multiplier: Multiplier): Money {
    if (this.status !== BetStatus.ACTIVE) {
      throw new InvalidBetStateError(this.status, 'cash out');
    }

    const payout = Money.fromCents(multiplier.calculatePayout(this.amount.toCents()));

    this.status = BetStatus.CASHED_OUT;
    this.cashOutMultiplier = multiplier;
    this.cashOutAmount = payout;
    this.cashedOutAt = new Date();

    return payout;
  }

  /**
   * Mark the bet as lost (round crashed before cash out).
   * Only ACTIVE bets can be lost — PENDING bets were never debited and are cancelled instead.
   */
  markAsLost(): void {
    if (this.status !== BetStatus.ACTIVE) {
      throw new InvalidBetStateError(this.status, 'mark as lost');
    }

    this.status = BetStatus.LOST;
  }

  /**
   * Net result for the player in cents: payout - stake when cashed out,
   * -stake when lost, zero otherwise.
   */
  getProfitCents(): bigint {
    if (this.status === BetStatus.CASHED_OUT && this.cashOutAmount) {
      return this.cashOutAmount.toCents() - this.amount.toCents();
    }
    if (this.status === BetStatus.LOST) {
      return -this.amount.toCents();
    }
    return 0n;
  }

  getCancelReason(): string | null {
    return this.cancelReason;
  }

  getAmount(): Money {
    return this.amount;
  }

  getStatus(): BetStatus {
    return this.status;
  }

  getCashOutMultiplier(): Multiplier | null {
    return this.cashOutMultiplier;
  }

  getCashOutAmount(): Money | null {
    return this.cashOutAmount;
  }

  getCashedOutAt(): Date | null {
    return this.cashedOutAt;
  }

  getCreatedAt(): Date {
    return this.createdAt;
  }

  getAutoCashOutMultiplier(): number | null {
    return this.autoCashOutMultiplier;
  }

  hasAutoCashOut(): boolean {
    return this.autoCashOutMultiplier !== null;
  }

  isPending(): boolean {
    return this.status === BetStatus.PENDING;
  }

  isCancelled(): boolean {
    return this.status === BetStatus.CANCELLED;
  }

  isActive(): boolean {
    return this.status === BetStatus.ACTIVE;
  }

  isCashedOut(): boolean {
    return this.status === BetStatus.CASHED_OUT;
  }

  isLost(): boolean {
    return this.status === BetStatus.LOST;
  }

  /**
   * Pull all pending domain events and clear the internal buffer.
   */
  pullEvents(): BetDomainEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  /**
   * Convert to plain object for persistence.
   */
  toPersistence(): BetSnapshot {
    return {
      id: this.id,
      roundId: this.roundId,
      playerId: this.playerId,
      playerName: this.playerName,
      amountCents: this.amount.toCents(),
      status: this.status,
      autoCashOutMultiplier: this.autoCashOutMultiplier,
      cashOutMultiplier: this.cashOutMultiplier?.getValue() ?? null,
      cashOutAmount: this.cashOutAmount?.toCents() ?? null,
      cashedOutAt: this.cashedOutAt,
      cancelReason: this.cancelReason,
      createdAt: this.createdAt,
    };
  }
}
