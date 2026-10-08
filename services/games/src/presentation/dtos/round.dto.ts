import { ApiProperty } from '@nestjs/swagger';
import { BetStatus } from '@/domain/entities/bet.entity';
import { RoundStatus } from '@/domain/entities/round.entity';
import type {
  BetOutput,
  GetCurrentRoundOutput,
} from '@/application/use-cases/get-current-round.use-case';
import type {
  GetRoundHistoryOutput,
  RoundSummaryOutput,
} from '@/application/use-cases/get-round-history.use-case';
import type { VerifyRoundOutput } from '@/application/use-cases/verify-round.use-case';
import { PaginationMetaDto } from './pagination.dto';
import { centsField } from './money';

export class BetOutputDto {
  @ApiProperty() id!: string;
  @ApiProperty() playerId!: string;
  @ApiProperty() playerName!: string;
  @ApiProperty({ example: 500 }) amountCents!: number;
  @ApiProperty({ example: '5.00' }) amountDecimal!: string;
  @ApiProperty({ enum: BetStatus }) status!: BetStatus;
  @ApiProperty({ example: 2.45, nullable: true }) cashOutMultiplier!: number | null;
  @ApiProperty({ example: 1225, nullable: true }) payoutCents!: number | null;
  @ApiProperty({ example: '12.25', nullable: true }) payoutDecimal!: string | null;
  @ApiProperty({ nullable: true }) cashedOutAt!: Date | null;
  @ApiProperty({ example: 1.5, nullable: true }) autoCashOutMultiplier!: number | null;

  static from(bet: BetOutput): BetOutputDto {
    const amount = centsField(bet.amountCents);
    const payout = bet.cashOutAmountCents !== null ? centsField(bet.cashOutAmountCents) : null;
    return {
      id: bet.id,
      playerId: bet.playerId,
      playerName: bet.playerName,
      amountCents: amount.cents,
      amountDecimal: amount.decimal,
      status: bet.status,
      cashOutMultiplier: bet.cashOutMultiplier,
      payoutCents: payout?.cents ?? null,
      payoutDecimal: payout?.decimal ?? null,
      cashedOutAt: bet.cashedOutAt,
      autoCashOutMultiplier: bet.autoCashOutMultiplier,
    };
  }
}

export class RoundOutputDto {
  @ApiProperty() roundId!: string;
  @ApiProperty({ enum: RoundStatus }) status!: RoundStatus;
  @ApiProperty({ nullable: true }) crashPoint!: number | null;
  @ApiProperty({ example: 1.87 }) currentMultiplier!: number;
  @ApiProperty({ nullable: true }) bettingEndTime!: Date | null;
  @ApiProperty({ nullable: true }) startedAt!: Date | null;
  @ApiProperty({ nullable: true }) crashedAt!: Date | null;
  @ApiProperty({ type: [BetOutputDto] }) bets!: BetOutputDto[];

  static from(round: GetCurrentRoundOutput): RoundOutputDto {
    return {
      roundId: round.roundId,
      status: round.status,
      crashPoint: round.crashPoint,
      currentMultiplier: round.currentMultiplier,
      bettingEndTime: round.bettingEndTime,
      startedAt: round.startedAt,
      crashedAt: round.crashedAt,
      bets: round.bets.map((bet) => BetOutputDto.from(bet)),
    };
  }
}

export class RoundSummaryOutputDto {
  @ApiProperty() roundId!: string;
  @ApiProperty({ nullable: true }) crashPoint!: number | null;
  @ApiProperty({ enum: RoundStatus }) status!: RoundStatus;
  @ApiProperty({ nullable: true }) startedAt!: Date | null;
  @ApiProperty({ nullable: true }) crashedAt!: Date | null;
  @ApiProperty({ example: 15 }) totalBets!: number;
  @ApiProperty({ example: 7500 }) totalWageredCents!: number;
  @ApiProperty({ example: '75.00' }) totalWageredDecimal!: string;

  static from(round: RoundSummaryOutput): RoundSummaryOutputDto {
    const wagered = centsField(round.totalWageredCents);
    return {
      roundId: round.roundId,
      crashPoint: round.crashPoint,
      status: round.status,
      startedAt: round.startedAt,
      crashedAt: round.crashedAt,
      totalBets: round.totalBets,
      totalWageredCents: wagered.cents,
      totalWageredDecimal: wagered.decimal,
    };
  }
}

export class GetRoundHistoryResponseDto {
  @ApiProperty({ type: [RoundSummaryOutputDto] }) data!: RoundSummaryOutputDto[];
  @ApiProperty() meta!: PaginationMetaDto;

  static from(result: GetRoundHistoryOutput): GetRoundHistoryResponseDto {
    return {
      data: result.data.map((round) => RoundSummaryOutputDto.from(round)),
      meta: result.meta,
    };
  }
}

export class VerifyRoundResponseDto {
  @ApiProperty() roundId!: string;
  @ApiProperty({ description: 'Revealed seed (only after crash)' }) seed!: string;
  @ApiProperty({ description: 'Committed hash' }) seedHash!: string;
  @ApiProperty({ description: 'Same value as seed (no separate salt)' }) salt!: string;
  @ApiProperty({ example: 2.45 }) crashPoint!: number;
  @ApiProperty({ example: true }) verified!: boolean;
  @ApiProperty() verificationFormula!: string;

  static from(result: VerifyRoundOutput): VerifyRoundResponseDto {
    return { ...result };
  }
}
