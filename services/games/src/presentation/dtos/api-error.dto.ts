import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiPropertyOptional({ description: 'Stable domain error code', example: 'BET_BELOW_MINIMUM' })
  code?: string;

  @ApiProperty({ description: 'Error class name', example: 'BetBelowMinimumError' })
  error!: string;

  @ApiProperty({ example: 'Bet amount must be at least 100 cents ($1.00)' })
  message!: string;

  @ApiProperty({ example: '/games/bet' })
  path!: string;

  @ApiProperty({ example: '2026-05-10T12:00:00.000Z' })
  timestamp!: string;
}
