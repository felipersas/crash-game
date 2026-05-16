import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Header,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../dtos/api-error.dto';
import {
  UserContext,
  type UserContext as UserContextType,
} from '../decorators/user-context.decorator';
import { PlaceBetUseCase } from '@/application/use-cases/place-bet.use-case';
import { CashOutUseCase } from '@/application/use-cases/cash-out.use-case';
import { GetCurrentRoundUseCase } from '@/application/use-cases/get-current-round.use-case';
import { GetRoundHistoryUseCase } from '@/application/use-cases/get-round-history.use-case';
import { VerifyRoundUseCase } from '@/application/use-cases/verify-round.use-case';
import { GetBetStatusUseCase } from '@/application/use-cases/get-bet-status.use-case';
import { GetMyBetsUseCase } from '@/application/use-cases/get-my-bets.use-case';
import { PlaceBetRequestDto, PlaceBetResponseDto } from '../dtos/place-bet.dto';
import { CashOutRequestDto, CashOutResponseDto } from '../dtos/cash-out.dto';
import {
  RoundOutputDto,
  GetRoundHistoryResponseDto,
  VerifyRoundResponseDto,
  BetOutputDto,
  type RoundSummaryOutputDto,
} from '../dtos/round.dto';
import { type PaginationQueryDto } from '../dtos/pagination.dto';
import { GetMyBetsResponseDto, MyBetOutputDto, BetsSummaryDto } from '../dtos/my-bets.dto';
import { HealthCheckResponseDto } from '../dtos/health-check-response.dto';
import { BetStatusResponseDto } from '../dtos/bet-status.dto';
import { centsToDecimal } from '../dtos/money.util';
import { PlayerId, RoundId, BetId } from '@crash/domain';
import { AUTO_CASHOUT_REPOSITORY } from '@/application/di.tokens';
import type { IAutoCashOutRepository } from '@/application/interfaces/auto-cashout.repository';

@ApiTags('Games')
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
    @Inject(AUTO_CASHOUT_REPOSITORY) private readonly autoCashOutRepo: IAutoCashOutRepository,
  ) {}

  @Get('health')
  @ApiOperation({
    summary: 'Games service health check',
    description: 'Returns service health status. No authentication required.',
  })
  @ApiResponse({ status: 200, description: 'Service is healthy', type: HealthCheckResponseDto })
  check(): HealthCheckResponseDto {
    return { status: 'ok', service: 'games' };
  }

  /**
   * Place a bet - returns 202 Accepted as bet confirmation is asynchronous.
   */
  @Post('bet')
  @HttpCode(HttpStatus.ACCEPTED)
  @Header('Content-Type', 'application/json')
  @ApiOperation({
    summary: 'Place a bet',
    description:
      'Place a bet on the current round. Returns 202 Accepted because confirmation is asynchronous (wallet debit via RabbitMQ).',
  })
  @ApiBearerAuth()
  @ApiResponse({
    status: 202,
    description: 'Bet placed (pending confirmation)',
    type: () => PlaceBetResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid bet', type: ApiErrorResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 409, description: 'Duplicate bet', type: ApiErrorResponseDto })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async placeBet(
    @UserContext() user: UserContextType,
    @Body() dto: PlaceBetRequestDto,
  ): Promise<PlaceBetResponseDto> {
    const result = await this.placeBetUseCase.execute({
      playerId: PlayerId.from(user.playerId),
      playerName: user.username,
      amountCents: BigInt(dto.amount),
      autoCashOutMultiplier: dto.autoCashOutAt,
    });

    return {
      roundId: result.roundId,
      betId: result.betId,
      amountCents: Number(result.amountCents),
      status: result.status,
      autoCashOutMultiplier: result.autoCashOutMultiplier ?? undefined,
    };
  }

  @Get('bets/me')
  @ApiOperation({
    summary: "Get player's bet history",
    description: 'Returns paginated bet history with win/loss summary.',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Bet history', type: GetMyBetsResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMyBets(
    @UserContext() user: UserContextType,
    @Query() query: PaginationQueryDto,
  ): Promise<GetMyBetsResponseDto> {
    const result = await this.getMyBetsUseCase.execute({
      playerId: PlayerId.from(user.playerId),
      page: query.page,
      limit: query.limit,
    });

    return {
      data: result.data.map((bet) =>
        MyBetOutputDto.fromBet(
          bet.id,
          bet.roundId,
          bet.amountCents,
          bet.cashOutMultiplier,
          bet.payoutCents,
          bet.profitCents,
          bet.status,
          bet.cashedOutAt,
          bet.placedAt,
        ),
      ),
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
  @ApiOperation({
    summary: 'Get bet status',
    description: 'Polling endpoint. No authentication required.',
  })
  @ApiParam({ name: 'betId', description: 'Bet UUID', type: String })
  @ApiResponse({ status: 200, description: 'Bet status', type: BetStatusResponseDto })
  @ApiResponse({ status: 404, description: 'Bet not found', type: ApiErrorResponseDto })
  async getBetStatus(@Param('betId') betId: string): Promise<BetStatusResponseDto> {
    const result = await this.getBetStatusUseCase.execute({ betId: BetId.from(betId) });

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
  @ApiOperation({
    summary: 'Cash out current bet',
    description: 'Cash out at the current multiplier. Idempotent via idempotencyKey.',
  })
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'Cash out successful',
    type: () => CashOutResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Cannot cash out', type: ApiErrorResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async cashOut(
    @UserContext() user: UserContextType,
    @Body() dto: CashOutRequestDto,
  ): Promise<CashOutResponseDto> {
    // Remove auto cash-out target on manual cashout (best-effort)
    if (dto.roundId) {
      try {
        await this.autoCashOutRepo.removeTarget(dto.roundId, user.playerId);
      } catch (error) {
        // Best-effort — don't fail manual cashout if Redis is down
      }
    }

    const result = await this.cashOutUseCase.execute({
      playerId: PlayerId.from(user.playerId),
      roundId: dto.roundId ? RoundId.from(dto.roundId) : undefined,
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
  @ApiOperation({
    summary: 'Get current round state',
    description: 'Returns current round with multiplier and bets. No authentication required.',
  })
  @ApiResponse({ status: 200, description: 'Current round', type: RoundOutputDto })
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
      bets: result.bets.map((bet) => {
        const amountCents = Number(bet.amountCents);
        const payoutCents = bet.cashOutAmountCents ? Number(bet.cashOutAmountCents) : null;
        return BetOutputDto.fromCents(
          bet.id,
          bet.playerId,
          bet.playerName,
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
  @ApiOperation({
    summary: 'Get round history',
    description: 'Paginated history of completed rounds.',
  })
  @ApiResponse({ status: 200, description: 'Round history', type: GetRoundHistoryResponseDto })
  async getRoundHistory(@Query() query: PaginationQueryDto): Promise<GetRoundHistoryResponseDto> {
    const result = await this.getRoundHistoryUseCase.execute({
      page: query.page,
      limit: query.limit,
    });

    return {
      data: result.data.map(
        (r): RoundSummaryOutputDto => ({
          roundId: r.roundId,
          crashPoint: r.crashPoint,
          status: r.status,
          startedAt: r.startedAt,
          crashedAt: r.crashedAt,
          totalBets: r.totalBets,
          totalWageredCents: r.totalWageredCents,
          totalWageredDecimal: centsToDecimal(r.totalWageredCents),
        }),
      ),
      meta: result.meta,
    };
  }

  @Get('rounds/:roundId/verify')
  @ApiOperation({
    summary: 'Verify round fairness (provably fair)',
    description: 'Verify crash point was generated fairly. Seed revealed only after crash.',
  })
  @ApiParam({ name: 'roundId', description: 'Round UUID', type: String })
  @ApiResponse({ status: 200, description: 'Verification result', type: VerifyRoundResponseDto })
  @ApiResponse({ status: 400, description: 'Seed not available', type: ApiErrorResponseDto })
  @ApiResponse({ status: 404, description: 'Round not found', type: ApiErrorResponseDto })
  async verifyRound(@Param('roundId') roundId: string): Promise<VerifyRoundResponseDto> {
    const result = await this.verifyRoundUseCase.execute({ roundId: RoundId.from(roundId) });
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
