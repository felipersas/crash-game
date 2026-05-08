import { IsString, IsNotEmpty, IsInt, Min, Max } from 'class-validator';

export class PlaceBetRequestDto {
  @IsString()
  @IsNotEmpty()
  playerId!: string;

  @IsInt()
  @Min(100) // $1.00 in cents
  @Max(100000) // $1,000.00 in cents
  amount!: number; // Amount in cents
}

export class PlaceBetResponseDto {
  roundId!: string;
  betId!: string;
  amountCents!: bigint;
  status!: string;
}
