import { IsString, IsOptional, IsUUID } from 'class-validator';

export class CashOutRequestDto {
  @IsUUID()
  @IsOptional()
  idempotencyKey?: string;

  @IsString()
  @IsOptional()
  roundId?: string;
}

export class CashOutResponseDto {
  betId!: string;
  roundId!: string;
  playerId!: string;
  cashOutMultiplier!: number;
  payoutCents!: number;
  payoutDecimal!: string;
}
