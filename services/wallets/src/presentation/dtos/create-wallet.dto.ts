import { IsString, IsNotEmpty, IsUUID } from 'class-validator';


export class CreateWalletResponseDto {
  @IsUUID()
  walletId!: string;

  @IsUUID()
  playerId!: string;

  @IsString()
  @IsNotEmpty()
  balance!: string;
}
