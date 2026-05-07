import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WalletsController } from '@/presentation/controllers/wallets.controller';
import { PrismaModule } from '@/infrastructure/persistence/prisma/prisma.module';
import { MessagingModule } from '@/infrastructure/messaging/messaging.module';
import { PrismaWalletRepository } from '@/infrastructure/persistence/prisma/wallet.repository.impl';
import { CreateWalletUseCase } from '@/application/use-cases/create-wallet.use-case';
import { GetWalletUseCase } from '@/application/use-cases/get-wallet.use-case';
import { CreditWalletUseCase } from '@/application/use-cases/credit-wallet.use-case';
import { DebitWalletUseCase } from '@/application/use-cases/debit-wallet.use-case';
import { RabbitMQEventPublisher } from '@/infrastructure/messaging/rabbitmq/event-publisher.impl';
import { WALLET_REPOSITORY, EVENT_PUBLISHER } from '@/infrastructure/di/tokens';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    MessagingModule,
  ],
  controllers: [WalletsController],
  providers: [
    // Repository
    { provide: WALLET_REPOSITORY, useClass: PrismaWalletRepository },

    // Event Publisher
    { provide: EVENT_PUBLISHER, useClass: RabbitMQEventPublisher },

    // Use Cases
    CreateWalletUseCase,
    GetWalletUseCase,
    CreditWalletUseCase,
    DebitWalletUseCase,
  ],
})
export class AppModule {}
