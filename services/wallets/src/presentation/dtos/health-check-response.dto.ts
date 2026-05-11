import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class HealthCheckResponseDto {
  @ApiProperty({ example: 'ok' })
  @IsString()
  @IsNotEmpty()
  status!: string;

  @ApiProperty({ example: 'wallets' })
  @IsString()
  @IsNotEmpty()
  service!: string;
}
