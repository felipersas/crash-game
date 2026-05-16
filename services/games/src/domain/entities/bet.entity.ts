import { Multiplier } from '../value-objects/multiplier.value-object';
import { Money, type BetId, type RoundId, type PlayerId, BetId as BetIdVO } from '@crash/domain';
import { InvalidBetStateError } from '../errors/domain.errors';

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

export class Bet {
  readonly id: BetId;
  readonly roundId: RoundId;
  readonly playerId: PlayerId;
  readonly playerName: string;
  private amount: Money;
  private status: BetStatus;
  private cashOutMultiplier: Multiplier | null;
  private cashOutAmount: Money | null;
  private cashedOutAt: Date | null;
  private autoCashOutMultiplier: number | null;
  private cancelReason: string | null;
  private createdAt: Date;

  private constructor(
    id: BetId,
    roundId: RoundId,
    playerId: PlayerId,
    playerName: string,
    amount: Money,
    status: BetStatus,
  ) {
    this.id = id;
    this.roundId = roundId;
    this.playerId = playerId;
    this.playerName = playerName;
    this.amount = amount;
    this.status = status;
    this.cashOutMultiplier = null;
    this.cashOutAmount = null;
    this.cashedOutAt = null;
    this.cancelReason = null;
    this.autoCashOutMultiplier = null;
    this.createdAt = new Date();
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
    if (autoCashOutMultiplier !== undefined && autoCashOutMultiplier < 1.01) {
      throw new Error('Auto cash-out multiplier must be at least 1.01');
    }
    const betId = BetIdVO.create();
    const bet = new Bet(betId, roundId, playerId, playerName, amount, BetStatus.PENDING);
    bet.autoCashOutMultiplier = autoCashOutMultiplier ?? null;
    return bet;
  }

  /**
   * Factory method to restore a bet from persistence.
   */
  static restore(
    id: BetId,
    roundId: RoundId,
    playerId: PlayerId,
    playerName: string,
    amountCents: bigint,
    status: BetStatus,
    autoCashOutMultiplier: number | null,
    cashOutMultiplier: number | null,
    cashOutAmountCents: bigint | null,
    cashedOutAt: Date | null,
    createdAt?: Date,
  ): Bet {
    const amount = Money.fromCents(amountCents);
    const bet = new Bet(id, roundId, playerId, playerName, amount, status);

    bet.autoCashOutMultiplier = autoCashOutMultiplier;
    if (cashOutMultiplier !== null) {
      bet.cashOutMultiplier = Multiplier.fromValue(cashOutMultiplier);
    }
    bet.cashOutAmount = cashOutAmountCents !== null ? Money.fromCents(cashOutAmountCents) : null;
    bet.cashedOutAt = cashedOutAt;
    if (createdAt) bet.createdAt = createdAt;

    return bet;
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
  }

  /**
   * Cancel the bet after wallet debit failure.
   * Transition from PENDING to CANCELLED.
   */
  cancel(reason: string): void {
    if (this.status !== BetStatus.PENDING) {
      throw new InvalidBetStateError(this.status, 'cancel');
    }

    this.status = BetStatus.CANCELLED;
    this.cancelReason = reason;
  }

  /**
   * Cash out the bet at the current multiplier.
   * Only allowed if bet is ACTIVE (confirmed by wallet).
   */
  cashOut(multiplier: Multiplier): Money {
    if (this.status !== BetStatus.ACTIVE) {
      throw new InvalidBetStateError(this.status, 'cash out');
    }

    const payout = multiplier.calculatePayout(this.amount.toCents());
    this.cashOutAmount = Money.fromCents(payout);

    this.status = BetStatus.CASHED_OUT;
    this.cashOutMultiplier = multiplier;
    this.cashedOutAt = new Date();

    return this.cashOutAmount;
  }

  /**
   * Mark the bet as lost (round crashed before cash out).
   * Only allowed if bet is ACTIVE.
   * PENDING bets are also marked as lost (implicit cancellation).
   */
  markAsLost(): void {
    if (this.status !== BetStatus.ACTIVE && this.status !== BetStatus.PENDING) {
      throw new InvalidBetStateError(this.status, 'mark as lost');
    }

    this.status = BetStatus.LOST;
  }

  /**
   * Get the cancellation reason (if cancelled).
   */
  getCancelReason(): string | null {
    return this.cancelReason;
  }

  /**
   * Get the bet amount.
   */
  getAmount(): Money {
    return this.amount;
  }

  /**
   * Get the bet status.
   */
  getStatus(): BetStatus {
    return this.status;
  }

  /**
   * Get the cash out multiplier (if cashed out).
   */
  getCashOutMultiplier(): Multiplier | null {
    return this.cashOutMultiplier;
  }

  /**
   * Get the cash out amount (if cashed out).
   */
  getCashOutAmount(): Money | null {
    return this.cashOutAmount;
  }

  /**
   * Get the time when the bet was cashed out.
   */
  getCashedOutAt(): Date | null {
    return this.cashedOutAt;
  }

  /**
   * Get the time when the bet was placed.
   */
  getCreatedAt(): Date {
    return this.createdAt;
  }

  /**
   * Get the auto cash-out multiplier target (if set).
   */
  getAutoCashOutMultiplier(): number | null {
    return this.autoCashOutMultiplier;
  }

  /**
   * Check if auto cash-out is enabled for this bet.
   */
  hasAutoCashOut(): boolean {
    return this.autoCashOutMultiplier !== null;
  }

  /**
   * Check if the bet is pending confirmation.
   */
  isPending(): boolean {
    return this.status === BetStatus.PENDING;
  }

  /**
   * Check if the bet is cancelled.
   */
  isCancelled(): boolean {
    return this.status === BetStatus.CANCELLED;
  }

  /**
   * Check if the bet is active (confirmed and not cashed out or lost).
   */
  isActive(): boolean {
    return this.status === BetStatus.ACTIVE;
  }

  /**
   * Check if the bet was cashed out.
   */
  isCashedOut(): boolean {
    return this.status === BetStatus.CASHED_OUT;
  }

  /**
   * Check if the bet was lost.
   */
  isLost(): boolean {
    return this.status === BetStatus.LOST;
  }

  /**
   * Convert to plain object for persistence.
   */
  toPersistence() {
    return {
      id: this.id,
      roundId: this.roundId,
      playerId: this.playerId,
      playerName: this.playerName,
      autoCashOutMultiplier: this.autoCashOutMultiplier,
      amountCents: this.amount.toCents(),
      status: this.status,
      cashOutMultiplier: this.cashOutMultiplier?.getValue() ?? null,
      cashOutAmount: this.cashOutAmount?.toCents() ?? null,
      cashedOutAt: this.cashedOutAt,
    };
  }
}
