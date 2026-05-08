import { Module } from '@nestjs/common';
import { RoundLifecycleProducer } from './round-lifecycle-producer';
import { RoundLifecycleConsumer } from './round-lifecycle-consumer';
import { StartRoundHandler } from './handlers/start-round.handler';
import { EndBettingPhaseHandler } from './handlers/end-betting-phase.handler';
import { MultiplierUpdateHandler } from './handlers/multiplier-update.handler';
import { RecoveryHandler } from './handlers/recovery.handler';
import { PrismaModule } from '../../persistence/prisma/prisma.module';
import { PrismaService } from '../../persistence/prisma/prisma.service';
import { PrismaRoundRepository } from '../../persistence/prisma/round.repository.impl';
import { ROUND_REPOSITORY, EVENT_PUBLISHER } from '../../di/tokens';
import { RabbitMQEventPublisher } from './event-publisher.impl';

/**
 * Round Lifecycle Module
 *
 * Configures all components for RabbitMQ-based round lifecycle management.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    // Dependencies
    PrismaService,
    {
      provide: ROUND_REPOSITORY,
      useClass: PrismaRoundRepository,
    },
    {
      provide: EVENT_PUBLISHER,
      useClass: RabbitMQEventPublisher,
    },
    RabbitMQEventPublisher,

    // Producer
    RoundLifecycleProducer,

    // Handlers
    StartRoundHandler,
    EndBettingPhaseHandler,
    MultiplierUpdateHandler,
    RecoveryHandler,

    // Consumer
    RoundLifecycleConsumer,
  ],
  exports: [
    RoundLifecycleProducer,
  ],
})
export class RoundLifecycleModule {}
