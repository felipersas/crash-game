import { Controller, Get, Post } from '@nestjs/common';
import { PlayerId } from '@crash/domain';
import {
  UserContext,
  type UserContext as UserContextType,
} from '../decorators/user-context.decorator';
import { HealthCheckResponseDto } from '../dtos/health-check-response.dto';
import { CreateWalletResponseDto } from '../dtos/create-wallet.dto';
import { GetWalletResponseDto } from '../dtos/get-wallet.dto';
import { CreateWalletUseCase } from '@/application/use-cases/create-wallet.use-case';
import { GetWalletUseCase } from '@/application/use-cases/get-wallet.use-case';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../dtos/api-error.dto';

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
    description: 'Creates wallet for authenticated player. Balance starts at 0.',
  })
  @ApiBearerAuth()
  @ApiResponse({ status: 201, description: 'Wallet created', type: CreateWalletResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 409, description: 'Wallet already exists', type: ApiErrorResponseDto })
  @Post()
  async createWallet(@UserContext() user: UserContextType): Promise<CreateWalletResponseDto> {
    const result = await this.createWalletUseCase.execute({ playerId: PlayerId.from(user.playerId) });
    return {
      walletId: result.walletId,
      playerId: result.playerId,
      balance: result.balance,
    };
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
  async getWallet(@UserContext() user: UserContextType): Promise<GetWalletResponseDto> {
    const result = await this.getWalletUseCase.execute({ playerId: PlayerId.from(user.playerId) });
    return {
      walletId: result.walletId,
      playerId: result.playerId,
      balance: result.balance,
      version: result.version,
    };
  }
}
