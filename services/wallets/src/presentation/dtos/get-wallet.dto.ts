import { IsString, IsNotEmpty, IsUUID, IsNumber } from 'class-validator';

export class GetWalletResponseDto {
  @IsUUID()
  walletId!: string;

  @IsUUID()
  playerId!: string;

  @IsString()
  @IsNotEmpty()
  balance!: string;

  @IsNumber()
  version!: number;
}
