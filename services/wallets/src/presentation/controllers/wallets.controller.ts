import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { HealthCheckResponseDto } from '@/presentation/dtos/health-check-response.dto';
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
  async createWallet(@Req() req: any) {
    // TODO: Extract playerId from JWT
    const playerId = req.user?.sub || 'player-id-from-jwt';

    const result = await this.createWalletUseCase.execute({ playerId });
    return result;
  }

  @Get('wallets/me')
  async getWallet(@Req() req: any) {
    // TODO: Extract playerId from JWT
    const playerId = req.user?.sub || 'player-id-from-jwt';

    const result = await this.getWalletUseCase.execute({ playerId });
    return result;
  }
}
