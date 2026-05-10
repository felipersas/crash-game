import { PaginationQueryDto, PaginationMetaDto } from './pagination.dto';
import { centsToDecimal } from './money.util';
import { ApiProperty } from '@nestjs/swagger';

export { PaginationQueryDto, PaginationMetaDto };

export class BetOutputDto {
  @ApiProperty() id!: string;
  @ApiProperty() playerId!: string;
  @ApiProperty({ example: 500 }) amountCents!: number;
  @ApiProperty({ example: '5.00' }) amountDecimal!: string;
  @ApiProperty({ enum: ['PENDING', 'ACTIVE', 'CASHED_OUT', 'LOST', 'CANCELLED'] }) status!: string;
  @ApiProperty({ example: 2.45, nullable: true }) cashOutMultiplier!: number | null;
  @ApiProperty({ example: 1225, nullable: true }) payoutCents!: number | null;
  @ApiProperty({ example: '12.25', nullable: true }) payoutDecimal!: string | null;
  @ApiProperty({ nullable: true }) cashedOutAt!: Date | null;

  static fromCents(
    id: string,
    playerId: string,
    amountCents: number,
    status: string,
    cashOutMultiplier: number | null,
    payoutCents: number | null,
    cashedOutAt: Date | null,
  ): BetOutputDto {
    return {
      id,
      playerId,
      amountCents,
      amountDecimal: centsToDecimal(amountCents),
      status,
      cashOutMultiplier,
      payoutCents,
      payoutDecimal: payoutCents !== null ? centsToDecimal(payoutCents) : null,
      cashedOutAt,
    };
  }
}

export class RoundOutputDto {
  @ApiProperty() roundId!: string;
  @ApiProperty({ enum: ['BETTING', 'ACTIVE', 'CRASHED'] }) status!: string;
  @ApiProperty({ nullable: true }) crashPoint!: number | null;
  @ApiProperty({ example: 1.87 }) currentMultiplier!: number;
  @ApiProperty({ nullable: true }) bettingEndTime!: Date | null;
  @ApiProperty({ nullable: true }) startedAt!: Date | null;
  @ApiProperty({ nullable: true }) crashedAt!: Date | null;
  @ApiProperty({ type: [BetOutputDto] }) bets!: BetOutputDto[];
}

export class RoundSummaryOutputDto {
  @ApiProperty() roundId!: string;
  @ApiProperty({ nullable: true }) crashPoint!: number | null;
  @ApiProperty({ enum: ['BETTING', 'ACTIVE', 'CRASHED'] }) status!: string;
  @ApiProperty({ nullable: true }) startedAt!: Date | null;
  @ApiProperty({ nullable: true }) crashedAt!: Date | null;
  @ApiProperty({ example: 15 }) totalBets!: number;
  @ApiProperty({ example: 7500 }) totalWageredCents!: number;
  @ApiProperty({ example: '75.00' }) totalWageredDecimal!: string;
}

export class GetRoundHistoryResponseDto {
  @ApiProperty({ type: [RoundSummaryOutputDto] }) data!: RoundSummaryOutputDto[];
  @ApiProperty() meta!: PaginationMetaDto;
}

export class VerifyRoundResponseDto {
  @ApiProperty() roundId!: string;
  @ApiProperty({ description: 'Revealed seed (only after crash)' }) seed!: string;
  @ApiProperty({ description: 'Committed hash' }) seedHash!: string;
  @ApiProperty() salt!: string;
  @ApiProperty({ example: 2.45 }) crashPoint!: number;
  @ApiProperty({ example: true }) verified!: boolean;
  @ApiProperty({ example: 'crashPoint = f(seed, salt) = 2.45' }) verificationFormula!: string;
}
