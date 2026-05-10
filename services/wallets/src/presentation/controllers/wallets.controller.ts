import { Controller, Get, Post } from '@nestjs/common';
import { UserContext, type UserContext as UserContextType } from '../decorators/user-context.decorator';
import { HealthCheckResponseDto } from '../dtos/health-check-response.dto';
import { CreateWalletResponseDto } from '../dtos/create-wallet.dto';
import { GetWalletResponseDto } from '../dtos/get-wallet.dto';
import { CreateWalletUseCase } from '@/application/use-cases/create-wallet.use-case';
import { GetWalletUseCase } from '@/application/use-cases/get-wallet.use-case';

@Controller('wallets')
export class WalletsController {
  constructor(
    private readonly createWalletUseCase: CreateWalletUseCase,
    private readonly getWalletUseCase: GetWalletUseCase,
  ) {}

  @Get('health')
  check(): HealthCheckResponseDto {
    return { status: 'ok', service: 'wallets' };
  }

  @Post()
  async createWallet(
    @UserContext() user: UserContextType,
  ): Promise<CreateWalletResponseDto> {

    const result = await this.createWalletUseCase.execute({ playerId: user.playerId });
    return {
      walletId: result.walletId,
      playerId: result.playerId,
      balance: result.balance,
    };
  }

  @Get('me')
  async getWallet(@UserContext() user: UserContextType): Promise<GetWalletResponseDto> {

    const result = await this.getWalletUseCase.execute({ playerId: user.playerId });
    return {
      walletId: result.walletId,
      playerId: result.playerId,
      balance: result.balance,
      version: result.version,
    };
  }
}
