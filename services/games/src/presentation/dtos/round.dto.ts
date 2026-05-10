import { PaginationQueryDto, PaginationMetaDto } from './pagination.dto';
import { centsToDecimal } from './money.util';

export { PaginationQueryDto, PaginationMetaDto };

export class BetOutputDto {
  id!: string;
  playerId!: string;
  amountCents!: number;
  amountDecimal!: string;
  status!: string;
  cashOutMultiplier!: number | null;
  payoutCents!: number | null;
  payoutDecimal!: string | null;
  cashedOutAt!: Date | null;

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
  roundId!: string;
  status!: string;
  crashPoint!: number | null;
  currentMultiplier!: number;
  bettingEndTime!: Date | null;
  startedAt!: Date | null;
  crashedAt!: Date | null;
  bets!: BetOutputDto[];
}

export class RoundSummaryOutputDto {
  roundId!: string;
  crashPoint!: number | null;
  status!: string;
  startedAt!: Date | null;
  crashedAt!: Date | null;
  totalBets!: number;
  totalWageredCents!: number;
  totalWageredDecimal!: string;
}

export class GetRoundHistoryResponseDto {
  data!: RoundSummaryOutputDto[];
  meta!: PaginationMetaDto;
}

export class VerifyRoundResponseDto {
  roundId!: string;
  seed!: string;
  seedHash!: string;
  salt!: string;
  crashPoint!: number;
  verified!: boolean;
  verificationFormula!: string;
}
