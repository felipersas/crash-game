import { IsInt, Min, Max, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Bet, BetStatus } from '@/domain/entities/bet.entity';
import type { PlaceBetOutput } from '@/application/use-cases/place-bet.use-case';

export class PlaceBetRequestDto {
  @ApiProperty({
    description: 'Bet amount in cents ($1.00 - $1,000.00)',
    example: 500,
    minimum: 100,
    maximum: 100000,
  })
  @IsInt()
  @Min(100)
  @Max(100000)
  amount!: number;

  @ApiProperty({
    description: 'Auto cash-out target multiplier',
    example: 2.5,
    required: false,
    minimum: Bet.MIN_AUTO_CASHOUT_MULTIPLIER,
    maximum: Bet.MAX_AUTO_CASHOUT_MULTIPLIER,
  })
  @IsOptional()
  @IsNumber()
  @Min(Bet.MIN_AUTO_CASHOUT_MULTIPLIER)
  @Max(Bet.MAX_AUTO_CASHOUT_MULTIPLIER)
  autoCashOutAt?: number;
}

export class PlaceBetResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  roundId!: string;

  @ApiProperty({ example: '660e8400-e29b-41d4-a716-446655440001' })
  betId!: string;

  @ApiProperty({ example: 500 })
  amountCents!: number;

  @ApiProperty({ example: BetStatus.PENDING, enum: BetStatus })
  status!: BetStatus;

  @ApiProperty({ example: 2.5, required: false })
  autoCashOutMultiplier?: number;

  static from(result: PlaceBetOutput): PlaceBetResponseDto {
    return {
      roundId: result.roundId,
      betId: result.betId,
      amountCents: Number(result.amountCents),
      status: result.status,
      autoCashOutMultiplier: result.autoCashOutMultiplier ?? undefined,
    };
  }
}
