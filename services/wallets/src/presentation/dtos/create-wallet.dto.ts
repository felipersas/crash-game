import { ApiProperty } from '@nestjs/swagger';
import type { CreateWalletOutput } from '@/application/use-cases/create-wallet.use-case';

export class CreateWalletResponseDto {
  @ApiProperty({ example: '880e8400-e29b-41d4-a716-446655440003' })
  walletId!: string;

  @ApiProperty({ example: 'player-uuid-1234' })
  playerId!: string;

  @ApiProperty({ description: 'Balance in cents as string', example: '0' })
  balance!: string;

  static from(wallet: CreateWalletOutput): CreateWalletResponseDto {
    return {
      walletId: wallet.walletId,
      playerId: wallet.playerId,
      balance: wallet.balanceCents.toString(),
    };
  }
}
