/**
 * Messaging Module - Infrastructure Layer
 *
 * Configures RabbitMQ event publisher and outbox processor.
 */

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RabbitMQEventPublisher } from '@/infrastructure/messaging/rabbitmq/event-publisher.impl';
import { OutboxProcessor } from '@/infrastructure/messaging/rabbitmq/outbox-processor';
import { PrismaModule } from '@/infrastructure/persistence/prisma/prisma.module';

@Module({
  imports: [PrismaModule, ScheduleModule.forRoot()],
  providers: [RabbitMQEventPublisher, OutboxProcessor],
  exports: [RabbitMQEventPublisher],
})
export class MessagingModule {}
