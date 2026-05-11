import { IsString, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CashOutRequestDto {
  @ApiProperty({
    description: 'UUID to prevent double cashout',
    example: '770e8400-e29b-41d4-a716-446655440002',
  })
  @IsUUID()
  idempotencyKey!: string;

  @ApiPropertyOptional({
    description: 'Optional round ID for validation',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @IsOptional()
  roundId?: string;
}

export class CashOutResponseDto {
  @ApiProperty({ example: '660e8400-e29b-41d4-a716-446655440001' })
  betId!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  roundId!: string;

  @ApiProperty({ example: 'player-uuid-1234' })
  playerId!: string;

  @ApiProperty({ description: 'Multiplier at cashout', example: 2.45 })
  cashOutMultiplier!: number;

  @ApiProperty({ description: 'Payout in cents (bet x multiplier)', example: 1225 })
  payoutCents!: number;

  @ApiProperty({ example: '12.25' })
  payoutDecimal!: string;
}
