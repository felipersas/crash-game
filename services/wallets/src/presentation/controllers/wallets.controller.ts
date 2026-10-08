import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PlayerId } from '@crash/domain';
import { UserContext } from '@crash/http';
import { CreateWalletUseCase } from '@/application/use-cases/create-wallet.use-case';
import { GetWalletUseCase } from '@/application/use-cases/get-wallet.use-case';
import { ApiErrorResponseDto } from '../dtos/api-error.dto';
import { HealthCheckResponseDto } from '../dtos/health-check-response.dto';
import { CreateWalletResponseDto } from '../dtos/create-wallet.dto';
import { GetWalletResponseDto } from '../dtos/get-wallet.dto';

@ApiTags('Wallets')
@Controller('wallets')
export class WalletsController {
  constructor(
    private readonly createWalletUseCase: CreateWalletUseCase,
    private readonly getWalletUseCase: GetWalletUseCase,
  ) {}

  @ApiOperation({
    summary: 'Wallets service health check',
    description: 'No authentication required.',
  })
  @ApiResponse({ status: 200, description: 'Service is healthy', type: HealthCheckResponseDto })
  @Get('health')
  check(): HealthCheckResponseDto {
    return { status: 'ok', service: 'wallets' };
  }

  @ApiOperation({
    summary: 'Create a wallet',
    description:
      'Creates the wallet of the authenticated player with a zero balance. Idempotent: returns the existing wallet if there is one.',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 201, description: 'Wallet created', type: CreateWalletResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Post()
  async createWallet(@UserContext() user: UserContext): Promise<CreateWalletResponseDto> {
    const result = await this.createWalletUseCase.execute({
      playerId: PlayerId.from(user.playerId),
    });
    return CreateWalletResponseDto.from(result);
  }

  @ApiOperation({
    summary: "Get player's wallet",
    description: 'Returns wallet with balance and optimistic lock version.',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'Wallet details', type: GetWalletResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Wallet not found', type: ApiErrorResponseDto })
  @Get('me')
  async getWallet(@UserContext() user: UserContext): Promise<GetWalletResponseDto> {
    const result = await this.getWalletUseCase.execute({ playerId: PlayerId.from(user.playerId) });
    return GetWalletResponseDto.from(result);
  }
}
