import { IsString, IsInt, IsNumber, IsOptional, IsDateString } from 'class-validator';
import { BetStatus } from '@prisma/client';

export class GetBetStatusParamsDto {
  @IsString()
  betId!: string;
}

export class BetStatusResponseDto {
  betId!: string;
  roundId!: string;
  playerId!: string;
  amountCents!: number;
  amountDecimal!: string;
  status!: BetStatus;
  cashOutMultiplier!: number | null;
  cashOutAmountCents!: number | null;
  cashOutAmountDecimal!: string | null;
  cashedOutAt!: Date | null;
  cancelReason!: string | null;
}
