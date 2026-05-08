import { Controller, Get, Post, Body, Param, Req } from '@nestjs/common';
import { PlaceBetUseCase } from '@/application/use-cases/place-bet.use-case';
import { CashOutUseCase } from '@/application/use-cases/cash-out.use-case';
import { GetCurrentRoundUseCase } from '@/application/use-cases/get-current-round.use-case';
import { GetRoundHistoryUseCase } from '@/application/use-cases/get-round-history.use-case';
import { VerifyRoundUseCase } from '@/application/use-cases/verify-round.use-case';
import { PlaceBetRequestDto, PlaceBetResponseDto } from '../dtos/place-bet.dto';
import { CashOutRequestDto, CashOutResponseDto } from '../dtos/cash-out.dto';
import { RoundOutputDto, GetRoundHistoryResponseDto, VerifyRoundResponseDto } from '../dtos/round.dto';
import { HealthCheckResponseDto } from '../dtos/health-check-response.dto';

@Controller()
export class GamesController {
  constructor(
    private readonly placeBetUseCase: PlaceBetUseCase,
    private readonly cashOutUseCase: CashOutUseCase,
    private readonly getCurrentRoundUseCase: GetCurrentRoundUseCase,
    private readonly getRoundHistoryUseCase: GetRoundHistoryUseCase,
    private readonly verifyRoundUseCase: VerifyRoundUseCase,
  ) {}

  @Get('health')
  check(): HealthCheckResponseDto {
    return { status: 'ok', service: 'games' };
  }

  @Post('bet')
  async placeBet(@Body() dto: PlaceBetRequestDto): Promise<PlaceBetResponseDto> {
    const result = await this.placeBetUseCase.execute({
      playerId: dto.playerId,
      amountCents: BigInt(dto.amount),
    });

    return {
      roundId: result.roundId,
      betId: result.betId,
      amountCents: result.amountCents,
      status: result.status,
    };
  }

  @Post('bet/cashout')
  async cashOut(@Body() dto: CashOutRequestDto, @Req() req: any): Promise<CashOutResponseDto> {
    // TODO: Extract playerId from JWT
    const playerId = req.user?.sub || 'player-id-from-jwt';

    const result = await this.cashOutUseCase.execute({
      playerId,
      roundId: dto.roundId,
    });

    const payoutDecimal = (Number(result.payoutCents) / 100).toFixed(2);

    return {
      betId: result.betId,
      roundId: result.roundId,
      playerId: result.playerId,
      cashOutMultiplier: result.cashOutMultiplier,
      payoutCents: result.payoutCents,
      payoutDecimal,
    };
  }

  @Get('rounds/current')
  async getCurrentRound(): Promise<RoundOutputDto> {
    const result = await this.getCurrentRoundUseCase.execute({ includeBets: true });

    return {
      roundId: result.roundId,
      status: result.status,
      crashPoint: result.crashPoint,
      seedHash: result.seedHash,
      currentMultiplier: result.currentMultiplier,
      bettingEndTime: result.bettingEndTime,
      startedAt: result.startedAt,
      crashedAt: result.crashedAt,
      bets: result.bets.map(bet => ({
        ...bet,
        cashOutAmountCents: bet.cashOutAmount,
        cashOutAmountDecimal: bet.cashOutAmount
          ? (Number(bet.cashOutAmount) / 100).toFixed(2)
          : null,
      })),
    };
  }

  @Get('rounds/history')
  async getRoundHistory(): Promise<GetRoundHistoryResponseDto> {
    const result = await this.getRoundHistoryUseCase.execute({ limit: 20, offset: 0 });
    return result;
  }

  @Get('rounds/:roundId/verify')
  async verifyRound(@Param('roundId') roundId: string): Promise<VerifyRoundResponseDto> {
    const result = await this.verifyRoundUseCase.execute({ roundId });
    return result;
  }
}
