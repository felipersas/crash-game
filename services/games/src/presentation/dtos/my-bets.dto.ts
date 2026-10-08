import { ApiProperty } from '@nestjs/swagger';
import { BetStatus } from '@/domain/entities/bet.entity';
import type { PlayerBetsSummary } from '@/application/interfaces/bet.repository';
import type { GetMyBetsOutput, MyBetOutput } from '@/application/use-cases/get-my-bets.use-case';
import { PaginationMetaDto } from './pagination.dto';
import { centsField } from './money';

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
  @ApiProperty({ enum: BetStatus }) status!: BetStatus;
  @ApiProperty({ nullable: true }) cashedOutAt!: Date | null;
  @ApiProperty() placedAt!: Date;

  static from(bet: MyBetOutput): MyBetOutputDto {
    const amount = centsField(bet.amountCents);
    const payout = bet.payoutCents !== null ? centsField(bet.payoutCents) : null;
    const profit = centsField(bet.profitCents);
    return {
      id: bet.id,
      roundId: bet.roundId,
      amountCents: amount.cents,
      amountDecimal: amount.decimal,
      cashOutMultiplier: bet.cashOutMultiplier,
      payoutCents: payout?.cents ?? null,
      payoutDecimal: payout?.decimal ?? null,
      profitCents: profit.cents,
      profitDecimal: profit.decimal,
      status: bet.status,
      cashedOutAt: bet.cashedOutAt,
      placedAt: bet.placedAt,
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

  static from(summary: PlayerBetsSummary): BetsSummaryDto {
    const wagered = centsField(summary.totalWageredCents);
    const profit = centsField(summary.profitCents);
    return {
      totalWageredCents: wagered.cents,
      totalWageredDecimal: wagered.decimal,
      wins: summary.wins,
      losses: summary.losses,
      profitCents: profit.cents,
      profitDecimal: profit.decimal,
    };
  }
}

export class GetMyBetsResponseDto {
  @ApiProperty({ type: [MyBetOutputDto] }) data!: MyBetOutputDto[];
  @ApiProperty() meta!: PaginationMetaDto;
  @ApiProperty() summary!: BetsSummaryDto;

  static from(result: GetMyBetsOutput): GetMyBetsResponseDto {
    return {
      data: result.data.map((bet) => MyBetOutputDto.from(bet)),
      meta: result.meta,
      summary: BetsSummaryDto.from(result.summary),
    };
  }
}
