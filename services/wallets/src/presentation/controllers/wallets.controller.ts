import { Controller, Get, Post, Body, Req } from '@nestjs/common';
import { HealthCheckResponseDto } from '@/presentation/dtos/health-check-response.dto';
import { CreateWalletRequestDto, CreateWalletResponseDto } from '@/presentation/dtos/create-wallet.dto';
import { GetWalletResponseDto } from '@/presentation/dtos/get-wallet.dto';
import { CreateWalletUseCase } from '@/application/use-cases/create-wallet.use-case';
import { GetWalletUseCase } from '@/application/use-cases/get-wallet.use-case';

@Controller()
export class WalletsController {
  constructor(
    private readonly createWalletUseCase: CreateWalletUseCase,
    private readonly getWalletUseCase: GetWalletUseCase,
  ) {}

  @Get('health')
  check(): HealthCheckResponseDto {
    return { status: 'ok', service: 'wallets' };
  }

  @Post('wallets')
  async createWallet(@Body() dto: CreateWalletRequestDto, @Req() req: any): Promise<CreateWalletResponseDto> {
    // TODO: Extract playerId from JWT
    const playerId = dto.playerId || req.user?.sub || 'player-id-from-jwt';

    const result = await this.createWalletUseCase.execute({ playerId });
    return {
      walletId: result.walletId,
      playerId: result.playerId,
      balance: result.balance,
    };
  }

  @Get('wallets/me')
  async getWallet(@Req() req: any): Promise<GetWalletResponseDto> {
    // TODO: Extract playerId from JWT
    const playerId = req.user?.sub || 'player-id-from-jwt';

    const result = await this.getWalletUseCase.execute({ playerId });
    return {
      walletId: result.walletId,
      playerId: result.playerId,
      balance: result.balance,
      version: result.version,
    };
  }
}
