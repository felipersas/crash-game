import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class CreateWalletRequestDto {
  @IsUUID()
  @IsNotEmpty()
  playerId!: string;
}

export class CreateWalletResponseDto {
  @IsUUID()
  walletId!: string;

  @IsUUID()
  playerId!: string;

  @IsString()
  @IsNotEmpty()
  balance!: string;
}
