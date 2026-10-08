import { ApiProperty } from '@nestjs/swagger';
import { BetStatus } from '@/domain/entities/bet.entity';
import type { BetStatusOutput } from '@/application/use-cases/get-bet-status.use-case';
import { centsField } from './money';

export class BetStatusResponseDto {
  @ApiProperty() betId!: string;
  @ApiProperty() roundId!: string;
  @ApiProperty() playerId!: string;
  @ApiProperty({ example: 500 }) amountCents!: number;
  @ApiProperty({ example: '5.00' }) amountDecimal!: string;
  @ApiProperty({ enum: BetStatus }) status!: BetStatus;
  @ApiProperty({ nullable: true }) cashOutMultiplier!: number | null;
  @ApiProperty({ nullable: true }) payoutCents!: number | null;
  @ApiProperty({ nullable: true }) payoutDecimal!: string | null;
  @ApiProperty({ nullable: true }) cashedOutAt!: Date | null;
  @ApiProperty({ nullable: true }) cancelReason!: string | null;

  static from(bet: BetStatusOutput): BetStatusResponseDto {
    const amount = centsField(bet.amountCents);
    const payout = bet.payoutCents !== null ? centsField(bet.payoutCents) : null;
    return {
      betId: bet.betId,
      roundId: bet.roundId,
      playerId: bet.playerId,
      amountCents: amount.cents,
      amountDecimal: amount.decimal,
      status: bet.status,
      cashOutMultiplier: bet.cashOutMultiplier,
      payoutCents: payout?.cents ?? null,
      payoutDecimal: payout?.decimal ?? null,
      cashedOutAt: bet.cashedOutAt,
      cancelReason: bet.cancelReason,
    };
  }
}
