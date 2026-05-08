import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { WalletsController } from '@/presentation/controllers/wallets.controller';
import { PrismaModule } from '@/infrastructure/persistence/prisma/prisma.module';
import { PrismaWalletRepository } from '@/infrastructure/persistence/prisma/wallet.repository.impl';
import { RabbitMQEventPublisher } from '@/infrastructure/messaging/rabbitmq/event-publisher.impl';
import { OutboxProcessor } from '@/infrastructure/messaging/rabbitmq/outbox-processor';
import { GamesEventsConsumer } from '@/infrastructure/messaging/rabbitmq/games-events.consumer';
import { BetPlacedEventHandler } from '@/infrastructure/messaging/rabbitmq/handlers/bet-placed.handler';
import { PlayerCashedOutEventHandler } from '@/infrastructure/messaging/rabbitmq/handlers/player-cashed-out.handler';
import { CreateWalletUseCase } from '@/application/use-cases/create-wallet.use-case';
import { GetWalletUseCase } from '@/application/use-cases/get-wallet.use-case';
import { CreditWalletUseCase } from '@/application/use-cases/credit-wallet.use-case';
import { DebitWalletUseCase } from '@/application/use-cases/debit-wallet.use-case';
import { WALLET_REPOSITORY, EVENT_PUBLISHER } from '@/infrastructure/di/tokens';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [WalletsController],
  providers: [
    // Repository
    { provide: WALLET_REPOSITORY, useClass: PrismaWalletRepository },

    // Event Publisher
    { provide: EVENT_PUBLISHER, useClass: RabbitMQEventPublisher },

    // Outbox Processor
    OutboxProcessor,

    // Games Events Consumer & Handlers
    GamesEventsConsumer,
    BetPlacedEventHandler,
    PlayerCashedOutEventHandler,

    // Use Cases
    CreateWalletUseCase,
    GetWalletUseCase,
    CreditWalletUseCase,
    DebitWalletUseCase,
  ],
})
export class AppModule {}
