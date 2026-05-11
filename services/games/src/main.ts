import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Transport } from '@nestjs/microservices';
import type { MicroserviceOptions } from '@nestjs/microservices';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL || 'amqp://admin:admin@localhost:5672'],
      exchange: 'wallet.events',
      exchangeType: 'fanout',
      queue: 'games.wallet.events',
      queueOptions: { durable: true },
      prefetchCount: 10,
      noAck: false,
    },
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Crash Game - Games Service')
    .setDescription('Game rounds, bets, cashout, and provably fair verification API')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Keycloak JWT token' },
      'bearer',
    )
    .build();
  try {
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api-docs', app, document, {
      useGlobalPrefix: false,
    });
  } catch (e) {
    console.warn('Swagger setup failed:', (e as Error).message);
  }

  await app.startAllMicroservices();

  const port = process.env.PORT ?? '4001';
  await app.listen(port, '0.0.0.0');
}

bootstrap();
