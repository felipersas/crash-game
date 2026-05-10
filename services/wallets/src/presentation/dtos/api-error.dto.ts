import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiPropertyOptional({ description: 'Stable domain error code', example: 'WALLET_NOT_FOUND' })
  code?: string;

  @ApiProperty({ description: 'Error class name', example: 'WalletNotFoundError' })
  error!: string;

  @ApiProperty({ example: 'Wallet not found' })
  message!: string;

  @ApiProperty({ example: '/wallets/me' })
  path!: string;

  @ApiProperty({ example: '2026-05-10T12:00:00.000Z' })
  timestamp!: string;
}
