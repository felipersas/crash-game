import { centsToDecimal } from './money.util';
import type { PaginationMetaDto } from './pagination.dto';
import { ApiProperty } from '@nestjs/swagger';

export class MyBetOutputDto {
  @ApiProperty() id!: string;
  @ApiProperty() roundId!: string;
  @ApiProperty({ example: 500 }) amountCents!: number;
  @ApiProperty({ example: '5.00' }) amountDecimal!: string;
  @ApiProperty({ nullable: true }) cashOutMultiplier!: number | null;
  @ApiProperty({ nullable: true }) payoutCents!: number | null;
  @ApiProperty({ nullable: true }) payoutDecimal!: string | null;
  @ApiProperty({ example: 725 }) profitCents!: number;
  @ApiProperty({ example: '7.25' }) profitDecimal!: string;
  @ApiProperty({ enum: ['PENDING', 'ACTIVE', 'CASHED_OUT', 'LOST', 'CANCELLED'] }) status!: string;
  @ApiProperty({ nullable: true }) cashedOutAt!: Date | null;
  @ApiProperty() placedAt!: Date;

  static fromBet(
    id: string,
    roundId: string,
    amountCents: number,
    cashOutMultiplier: number | null,
    payoutCents: number | null,
    profitCents: number,
    status: string,
    cashedOutAt: Date | null,
    placedAt: Date,
  ): MyBetOutputDto {
    return {
      id,
      roundId,
      amountCents,
      amountDecimal: centsToDecimal(amountCents),
      cashOutMultiplier,
      payoutCents,
      payoutDecimal: payoutCents !== null ? centsToDecimal(payoutCents) : null,
      profitCents,
      profitDecimal: centsToDecimal(profitCents),
      status,
      cashedOutAt,
      placedAt,
    };
  }
}

export class BetsSummaryDto {
  @ApiProperty({ example: 5000 }) totalWageredCents!: number;
  @ApiProperty({ example: '50.00' }) totalWageredDecimal!: string;
  @ApiProperty({ example: 3 }) wins!: number;
  @ApiProperty({ example: 2 }) losses!: number;
  @ApiProperty({ example: 1500 }) profitCents!: number;
  @ApiProperty({ example: '15.00' }) profitDecimal!: string;

  static fromCents(
    totalWageredCents: number,
    wins: number,
    losses: number,
    profitCents: number,
  ): BetsSummaryDto {
    return {
      totalWageredCents,
      totalWageredDecimal: centsToDecimal(totalWageredCents),
      wins,
      losses,
      profitCents,
      profitDecimal: centsToDecimal(profitCents),
    };
  }
}

export class GetMyBetsResponseDto {
  @ApiProperty({ type: [MyBetOutputDto] }) data!: MyBetOutputDto[];
  @ApiProperty() meta!: PaginationMetaDto;
  @ApiProperty() summary!: BetsSummaryDto;
}
