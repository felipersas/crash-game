import { IsString, IsNotEmpty, IsUUID, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetWalletResponseDto {
  @ApiProperty() @IsUUID() walletId!: string;
  @ApiProperty() @IsUUID() playerId!: string;
  @ApiProperty({ description: 'Balance in cents as string', example: '50000' }) @IsString() @IsNotEmpty() balance!: string;
  @ApiProperty({ description: 'Optimistic lock version', example: 3 }) @IsNumber() version!: number;
}
