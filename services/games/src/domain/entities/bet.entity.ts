import { Multiplier } from '../value-objects/multiplier.value-object';

/**
 * Bet Entity - Represents a player's bet in a round.
 *
 * A bet can be in one of three states:
 * - ACTIVE: Bet is placed, waiting for crash or cash out
 * - CASHED_OUT: Player cashed out, waiting for round completion
 * - LOST: Round crashed before player cashed out
 */

export enum BetStatus {
  ACTIVE = 'ACTIVE',
  CASHED_OUT = 'CASHED_OUT',
  LOST = 'LOST',
}

export class Bet {
  readonly id: string;
  readonly roundId: string;
  readonly playerId: string;
  private amountCents: bigint; // Stored in cents for precision
  private status: BetStatus;
  private cashOutMultiplier: Multiplier | null;
  private cashOutAmount: bigint | null;
  private cashedOutAt: Date | null;

  private constructor(
    id: string,
    roundId: string,
    playerId: string,
    amountCents: bigint,
    status: BetStatus,
  ) {
    this.id = id;
    this.roundId = roundId;
    this.playerId = playerId;
    this.amountCents = amountCents;
    this.status = status;
    this.cashOutMultiplier = null;
    this.cashOutAmount = null;
    this.cashedOutAt = null;
  }

  /**
   * Factory method to create a new bet.
   */
  static create(roundId: string, playerId: string, amountCents: bigint): Bet {
    const betId = crypto.randomUUID();
    return new Bet(betId, roundId, playerId, amountCents, BetStatus.ACTIVE);
  }

  /**
   * Factory method to restore a bet from persistence.
   */
  static restore(
    id: string,
    roundId: string,
    playerId: string,
    amountCents: bigint,
    status: BetStatus,
    cashOutMultiplier: number | null,
    cashOutAmount: bigint | null,
    cashedOutAt: Date | null,
  ): Bet {
    const bet = new Bet(id, roundId, playerId, amountCents, status);

    if (cashOutMultiplier !== null) {
      bet.cashOutMultiplier = Multiplier.fromValue(cashOutMultiplier);
    }
    bet.cashOutAmount = cashOutAmount;
    bet.cashedOutAt = cashedOutAt;

    return bet;
  }

  /**
   * Cash out the bet at the current multiplier.
   * Only allowed if bet is ACTIVE.
   */
  cashOut(multiplier: Multiplier): bigint {
    if (this.status !== BetStatus.ACTIVE) {
      throw new Error(`Cannot cash out bet in ${this.status} state`);
    }

    const payout = multiplier.calculatePayout(this.amountCents);

    this.status = BetStatus.CASHED_OUT;
    this.cashOutMultiplier = multiplier;
    this.cashOutAmount = payout;
    this.cashedOutAt = new Date();

    return payout;
  }

  /**
   * Mark the bet as lost (round crashed before cash out).
   * Only allowed if bet is ACTIVE.
   */
  markAsLost(): void {
    if (this.status !== BetStatus.ACTIVE) {
      throw new Error(`Cannot mark bet as ${BetStatus.LOST} when in ${this.status} state`);
    }

    this.status = BetStatus.LOST;
  }

  /**
   * Get the bet amount in cents.
   */
  getAmountCents(): bigint {
    return this.amountCents;
  }

  /**
   * Get the bet amount formatted as decimal string.
   */
  getAmountDecimal(): string {
    const cents = Number(this.amountCents);
    const whole = Math.floor(cents / 100);
    const fractional = cents % 100;
    return `${whole}.${fractional.toString().padStart(2, '0')}`;
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
  getCashOutAmount(): bigint | null {
    return this.cashOutAmount;
  }

  /**
   * Get the time when the bet was cashed out.
   */
  getCashedOutAt(): Date | null {
    return this.cashedOutAt;
  }

  /**
   * Check if the bet is active (not cashed out or lost).
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
      amountCents: this.amountCents,
      status: this.status,
      cashOutMultiplier: this.cashOutMultiplier?.getValue() || null,
      cashOutAmount: this.cashOutAmount,
      cashedOutAt: this.cashedOutAt,
    };
  }
}
