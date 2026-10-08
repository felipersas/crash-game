import { ApiProperty } from '@nestjs/swagger';
import type { GetWalletOutput } from '@/application/use-cases/get-wallet.use-case';

export class GetWalletResponseDto {
  @ApiProperty() walletId!: string;
  @ApiProperty() playerId!: string;
  @ApiProperty({ description: 'Balance in cents as string', example: '50000' })
  balance!: string;
  @ApiProperty({ description: 'Optimistic lock version', example: 3 }) version!: number;

  static from(wallet: GetWalletOutput): GetWalletResponseDto {
    return {
      walletId: wallet.walletId,
      playerId: wallet.playerId,
      balance: wallet.balanceCents.toString(),
      version: wallet.version,
    };
  }
}
