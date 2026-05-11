import { IsString, IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWalletResponseDto {
  @ApiProperty({ example: '880e8400-e29b-41d4-a716-446655440003' })
  @IsUUID()
  walletId!: string;

  @ApiProperty({ example: 'player-uuid-1234' })
  @IsUUID()
  playerId!: string;

  @ApiProperty({ description: 'Balance in cents as string', example: '0' })
  @IsString()
  @IsNotEmpty()
  balance!: string;
}
