import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { WalletsController } from '@/presentation/controllers/wallets.controller';
import { PrismaModule } from '@/infrastructure/persistence/prisma/prisma.module';
import { PrismaWalletRepository } from '@/infrastructure/persistence/prisma/wallet.repository.impl';
import { PrismaInboxRepository } from '@/infrastructure/persistence/prisma/inbox.repository.impl';
import { RabbitMQEventPublisher } from '@/infrastructure/messaging/rabbitmq/event-publisher.impl';
import { OutboxProcessor } from '@/infrastructure/messaging/rabbitmq/outbox-processor';
import { InboxProcessor } from '@/infrastructure/messaging/rabbitmq/inbox-processor';
import { GamesEventsConsumer } from '@/infrastructure/messaging/rabbitmq/games-events.consumer';
import { BetPlacedEventHandler } from '@/infrastructure/messaging/rabbitmq/handlers/bet-placed.handler';
import { PlayerCashedOutEventHandler } from '@/infrastructure/messaging/rabbitmq/handlers/player-cashed-out.handler';
import { CreateWalletUseCase } from '@/application/use-cases/create-wallet.use-case';
import { GetWalletUseCase } from '@/application/use-cases/get-wallet.use-case';
import { CreditWalletUseCase } from '@/application/use-cases/credit-wallet.use-case';
import { DebitWalletUseCase } from '@/application/use-cases/debit-wallet.use-case';
import { PlayerWalletResolver } from '@/application/services/player-wallet-resolver.service';
import { WALLET_REPOSITORY, INBOX_REPOSITORY, EVENT_PUBLISHER, PLAYER_WALLET_RESOLVER } from '@/infrastructure/di/tokens';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './infrastructure/filters/all-exceptions.filter';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ScheduleModule.forRoot(),
    // AuthModule, // Removed - auth now handled by Kong OIDC plugin
  ],
  controllers: [WalletsController],
  providers: [
    // Exception Filter (global - handles all exceptions)
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    // Authentication Guard removed - now handled by Kong OIDC plugin
    // Repositories
    { provide: WALLET_REPOSITORY, useClass: PrismaWalletRepository },
    { provide: INBOX_REPOSITORY, useClass: PrismaInboxRepository },

    // Event Publisher
    { provide: EVENT_PUBLISHER, useClass: RabbitMQEventPublisher },

    // Outbox/Inbox Processors
    OutboxProcessor,
    InboxProcessor,

    // Application Services
    { provide: PLAYER_WALLET_RESOLVER, useClass: PlayerWalletResolver },

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
