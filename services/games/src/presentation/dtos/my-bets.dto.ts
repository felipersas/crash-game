import { PaginationQueryDto, PaginationMetaDto } from './pagination.dto';
import { centsToDecimal } from './money.util';

export { PaginationQueryDto as GetMyBetsQueryDto, PaginationMetaDto };

export class MyBetOutputDto {
  id!: string;
  roundId!: string;
  amountCents!: number;
  amountDecimal!: string;
  cashOutMultiplier!: number | null;
  payoutCents!: number | null;
  payoutDecimal!: string | null;
  profitCents!: number;
  profitDecimal!: string;
  status!: string;
  cashedOutAt!: Date | null;
  placedAt!: Date;

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
  totalWageredCents!: number;
  totalWageredDecimal!: string;
  wins!: number;
  losses!: number;
  profitCents!: number;
  profitDecimal!: string;

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
  data!: MyBetOutputDto[];
  meta!: PaginationMetaDto;
  summary!: BetsSummaryDto;
}
