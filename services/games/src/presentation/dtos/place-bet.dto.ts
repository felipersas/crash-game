import { IsInt, Min, Max, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
    description: 'Auto cash-out target multiplier (min 1.01)',
    example: 2.5,
    required: false,
    minimum: 1.01,
  })
  @IsOptional()
  @IsNumber()
  @Min(1.01)
  @Max(1000)
  autoCashOutAt?: number;
}

export class PlaceBetResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  roundId!: string;

  @ApiProperty({ example: '660e8400-e29b-41d4-a716-446655440001' })
  betId!: string;

  @ApiProperty({ example: 500 })
  amountCents!: number;

  @ApiProperty({
    example: 'PENDING',
    enum: ['PENDING', 'ACTIVE', 'CASHED_OUT', 'LOST', 'CANCELLED'],
  })
  status!: string;

  @ApiProperty({ example: 2.5, nullable: true })
  autoCashOutMultiplier?: number;
}
