import { Controller, Get, Post, Body, Param, Query, HttpCode, HttpStatus, Header } from '@nestjs/common';
import { UserContext, type UserContext as UserContextType } from '../decorators/user-context.decorator';
import { PlaceBetUseCase } from '@/application/use-cases/place-bet.use-case';
import { CashOutUseCase } from '@/application/use-cases/cash-out.use-case';
import { GetCurrentRoundUseCase } from '@/application/use-cases/get-current-round.use-case';
import { GetRoundHistoryUseCase } from '@/application/use-cases/get-round-history.use-case';
import { VerifyRoundUseCase } from '@/application/use-cases/verify-round.use-case';
import { GetBetStatusUseCase } from '@/application/use-cases/get-bet-status.use-case';
import { GetMyBetsUseCase } from '@/application/use-cases/get-my-bets.use-case';
import { PlaceBetRequestDto } from '../dtos/place-bet.dto';
import { CashOutRequestDto } from '../dtos/cash-out.dto';
import { RoundOutputDto, GetRoundHistoryResponseDto, VerifyRoundResponseDto, BetOutputDto, RoundSummaryOutputDto } from '../dtos/round.dto';
import { PaginationQueryDto } from '../dtos/pagination.dto';
import { GetMyBetsResponseDto, MyBetOutputDto, BetsSummaryDto } from '../dtos/my-bets.dto';
import { HealthCheckResponseDto } from '../dtos/health-check-response.dto';
import { BetStatusResponseDto } from '../dtos/bet-status.dto';
import { centsToDecimal } from '../dtos/money.util';

@Controller('games')
export class GamesController {
  constructor(
    private readonly placeBetUseCase: PlaceBetUseCase,
    private readonly cashOutUseCase: CashOutUseCase,
    private readonly getCurrentRoundUseCase: GetCurrentRoundUseCase,
    private readonly getRoundHistoryUseCase: GetRoundHistoryUseCase,
    private readonly verifyRoundUseCase: VerifyRoundUseCase,
    private readonly getBetStatusUseCase: GetBetStatusUseCase,
    private readonly getMyBetsUseCase: GetMyBetsUseCase,
  ) {}

  @Get('health')
  check(): HealthCheckResponseDto {
    return { status: 'ok', service: 'games' };
  }

  /**
   * Place a bet - returns 202 Accepted as bet confirmation is asynchronous.
   */
  @Post('bet')
  @HttpCode(HttpStatus.ACCEPTED)
  @Header('Content-Type', 'application/json')
  async placeBet(
    @UserContext() user: UserContextType,
    @Body() dto: PlaceBetRequestDto,
  ): Promise<import('../dtos/place-bet.dto').PlaceBetResponseDto> {
    const result = await this.placeBetUseCase.execute({
      playerId: user.playerId,
      amountCents: BigInt(dto.amount),
    });

    return {
      roundId: result.roundId,
      betId: result.betId,
      amountCents: Number(result.amountCents),
      status: result.status,
    };
  }

  @Get('bets/me')
  async getMyBets(
    @UserContext() user: UserContextType,
    @Query() query: PaginationQueryDto,
  ): Promise<GetMyBetsResponseDto> {
    const result = await this.getMyBetsUseCase.execute({
      playerId: user.playerId,
      page: query.page,
      limit: query.limit,
    });

    return {
      data: result.data.map(bet => MyBetOutputDto.fromBet(
        bet.id,
        bet.roundId,
        bet.amountCents,
        bet.cashOutMultiplier,
        bet.payoutCents,
        bet.profitCents,
        bet.status,
        bet.cashedOutAt,
        bet.placedAt,
      )),
      meta: result.meta,
      summary: BetsSummaryDto.fromCents(
        result.summary.totalWageredCents,
        result.summary.wins,
        result.summary.losses,
        result.summary.profitCents,
      ),
    };
  }

  /**
   * Get bet status - polling endpoint for clients to check bet confirmation status.
   */
  @Get('bets/:betId')
  async getBetStatus(@Param('betId') betId: string): Promise<BetStatusResponseDto> {
    const result = await this.getBetStatusUseCase.execute({ betId });

    const amountCents = Number(result.amountCents);
    const payoutCents = result.payoutCents ? Number(result.payoutCents) : null;

    return {
      betId: result.betId,
      roundId: result.roundId,
      playerId: result.playerId,
      amountCents,
      amountDecimal: centsToDecimal(amountCents),
      status: result.status,
      cashOutMultiplier: result.cashOutMultiplier,
      payoutCents,
      payoutDecimal: payoutCents !== null ? centsToDecimal(payoutCents) : null,
      cashedOutAt: result.cashedOutAt,
      cancelReason: result.cancelReason,
    };
  }

  @Post('bet/cashout')
  async cashOut(
    @UserContext() user: UserContextType,
    @Body() dto: CashOutRequestDto,
  ): Promise<import('../dtos/cash-out.dto').CashOutResponseDto> {
    const result = await this.cashOutUseCase.execute({
      playerId: user.playerId,
      roundId: dto.roundId,
      idempotencyKey: dto.idempotencyKey,
    });

    const payoutCents = Number(result.payoutCents);

    return {
      betId: result.betId,
      roundId: result.roundId,
      playerId: result.playerId,
      cashOutMultiplier: result.cashOutMultiplier,
      payoutCents,
      payoutDecimal: centsToDecimal(payoutCents),
    };
  }

  @Get('rounds/current')
  async getCurrentRound(): Promise<RoundOutputDto> {
    const result = await this.getCurrentRoundUseCase.execute({ includeBets: true });

    return {
      roundId: result.roundId,
      status: result.status,
      crashPoint: result.crashPoint,
      currentMultiplier: result.currentMultiplier,
      bettingEndTime: result.bettingEndTime,
      startedAt: result.startedAt,
      crashedAt: result.crashedAt,
      bets: result.bets.map(bet => {
        const amountCents = Number(bet.amountCents);
        const payoutCents = bet.cashOutAmountCents ? Number(bet.cashOutAmountCents) : null;
        return BetOutputDto.fromCents(
          bet.id,
          bet.playerId,
          amountCents,
          bet.status,
          bet.cashOutMultiplier,
          payoutCents,
          bet.cashedOutAt,
        );
      }),
    };
  }

  @Get('rounds/history')
  async getRoundHistory(@Query() query: PaginationQueryDto): Promise<GetRoundHistoryResponseDto> {
    const result = await this.getRoundHistoryUseCase.execute({
      page: query.page,
      limit: query.limit,
    });

    return {
      data: result.data.map((r): RoundSummaryOutputDto => ({
        roundId: r.roundId,
        crashPoint: r.crashPoint,
        status: r.status,
        startedAt: r.startedAt,
        crashedAt: r.crashedAt,
        totalBets: r.totalBets,
        totalWageredCents: r.totalWageredCents,
        totalWageredDecimal: centsToDecimal(r.totalWageredCents),
      })),
      meta: result.meta,
    };
  }

  @Get('rounds/:roundId/verify')
  async verifyRound(@Param('roundId') roundId: string): Promise<VerifyRoundResponseDto> {
    const result = await this.verifyRoundUseCase.execute({ roundId });
    return {
      roundId: result.roundId,
      seed: result.seed,
      seedHash: result.seedHash,
      salt: result.salt,
      crashPoint: result.crashPoint,
      verified: result.verified,
      verificationFormula: result.verificationFormula,
    };
  }
}
