import { ApiProperty } from '@nestjs/swagger';

export class BetStatusResponseDto {
  @ApiProperty() betId!: string;
  @ApiProperty() roundId!: string;
  @ApiProperty() playerId!: string;
  @ApiProperty({ example: 500 }) amountCents!: number;
  @ApiProperty({ example: '5.00' }) amountDecimal!: string;
  @ApiProperty({ enum: ['PENDING', 'ACTIVE', 'CASHED_OUT', 'LOST', 'CANCELLED'] }) status!: string;
  @ApiProperty({ nullable: true }) cashOutMultiplier!: number | null;
  @ApiProperty({ nullable: true }) payoutCents!: number | null;
  @ApiProperty({ nullable: true }) payoutDecimal!: string | null;
  @ApiProperty({ nullable: true }) cashedOutAt!: Date | null;
  @ApiProperty({ nullable: true }) cancelReason!: string | null;
}
