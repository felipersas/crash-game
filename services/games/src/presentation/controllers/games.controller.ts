import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { PlayerId, RoundId, BetId } from '@crash/domain';
import { UserContext } from '@crash/http';
import { PlaceBetUseCase } from '@/application/use-cases/place-bet.use-case';
import { CashOutUseCase } from '@/application/use-cases/cash-out.use-case';
import { GetCurrentRoundUseCase } from '@/application/use-cases/get-current-round.use-case';
import { GetRoundHistoryUseCase } from '@/application/use-cases/get-round-history.use-case';
import { VerifyRoundUseCase } from '@/application/use-cases/verify-round.use-case';
import { GetBetStatusUseCase } from '@/application/use-cases/get-bet-status.use-case';
import { GetMyBetsUseCase } from '@/application/use-cases/get-my-bets.use-case';
import { ApiErrorResponseDto } from '../dtos/api-error.dto';
import { PlaceBetRequestDto, PlaceBetResponseDto } from '../dtos/place-bet.dto';
import { CashOutRequestDto, CashOutResponseDto } from '../dtos/cash-out.dto';
import {
  RoundOutputDto,
  GetRoundHistoryResponseDto,
  VerifyRoundResponseDto,
} from '../dtos/round.dto';
import { PaginationQueryDto } from '../dtos/pagination.dto';
import { GetMyBetsResponseDto } from '../dtos/my-bets.dto';
import { HealthCheckResponseDto } from '../dtos/health-check-response.dto';
import { BetStatusResponseDto } from '../dtos/bet-status.dto';

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
    @UserContext() user: UserContext,
    @Body() dto: PlaceBetRequestDto,
  ): Promise<PlaceBetResponseDto> {
    const result = await this.placeBetUseCase.execute({
      playerId: PlayerId.from(user.playerId),
      playerName: user.username,
      amountCents: BigInt(dto.amount),
      autoCashOutMultiplier: dto.autoCashOutAt,
    });
    return PlaceBetResponseDto.from(result);
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
    @UserContext() user: UserContext,
    @Query() query: PaginationQueryDto,
  ): Promise<GetMyBetsResponseDto> {
    const result = await this.getMyBetsUseCase.execute({
      playerId: PlayerId.from(user.playerId),
      page: query.page,
      limit: query.limit,
    });
    return GetMyBetsResponseDto.from(result);
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
  async getBetStatus(@Param('betId', ParseUUIDPipe) betId: string): Promise<BetStatusResponseDto> {
    const result = await this.getBetStatusUseCase.execute({ betId: BetId.from(betId) });
    return BetStatusResponseDto.from(result);
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
    @UserContext() user: UserContext,
    @Body() dto: CashOutRequestDto,
  ): Promise<CashOutResponseDto> {
    const result = await this.cashOutUseCase.execute({
      playerId: PlayerId.from(user.playerId),
      roundId: dto.roundId ? RoundId.from(dto.roundId) : undefined,
      idempotencyKey: dto.idempotencyKey,
    });
    return CashOutResponseDto.from(result);
  }

  @Get('rounds/current')
  @ApiOperation({
    summary: 'Get current round state',
    description: 'Returns current round with multiplier and bets. No authentication required.',
  })
  @ApiResponse({ status: 200, description: 'Current round', type: RoundOutputDto })
  async getCurrentRound(): Promise<RoundOutputDto> {
    const result = await this.getCurrentRoundUseCase.execute({ includeBets: true });
    return RoundOutputDto.from(result);
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
    return GetRoundHistoryResponseDto.from(result);
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
  async verifyRound(
    @Param('roundId', ParseUUIDPipe) roundId: string,
  ): Promise<VerifyRoundResponseDto> {
    const result = await this.verifyRoundUseCase.execute({ roundId: RoundId.from(roundId) });
    return VerifyRoundResponseDto.from(result);
  }
}
