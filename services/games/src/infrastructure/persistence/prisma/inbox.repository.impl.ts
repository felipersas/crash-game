import { Injectable } from '@nestjs/common';
import { Prisma, type InboxEvent as InboxEventRow } from '@prisma/client';
import type {
  IInboxRepository,
  InboxEvent,
  InboxEventCreateInput,
  InboxEventStatus,
} from '@/application/interfaces/inbox.repository';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaInboxRepository implements IInboxRepository {
  constructor(private readonly prisma: PrismaService) {}

  async tryCreate(input: InboxEventCreateInput): Promise<InboxEvent | null> {
    try {
      const row = await this.prisma.inboxEvent.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          eventType: input.eventType,
          payload: input.payload as Prisma.InputJsonValue,
          status: 'PENDING',
        },
      });
      return this.toDomain(row);
    } catch (error: unknown) {
      // Unique constraint on idempotency_key: the event was already received
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return null;
      }
      throw error;
    }
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<InboxEvent | null> {
    const row = await this.prisma.inboxEvent.findUnique({ where: { idempotencyKey } });
    return row ? this.toDomain(row) : null;
  }

  async markAsProcessed(id: string): Promise<void> {
    await this.prisma.inboxEvent.update({
      where: { id },
      data: { status: 'PROCESSED', processedAt: new Date(), errorMessage: null },
    });
  }

  async markAsFailed(id: string, errorMessage: string): Promise<void> {
    await this.prisma.inboxEvent.update({
      where: { id },
      data: { status: 'FAILED', errorMessage, retryCount: { increment: 1 } },
    });
  }

  async findFailed(maxRetries: number): Promise<InboxEvent[]> {
    const rows = await this.prisma.inboxEvent.findMany({
      where: { status: 'FAILED', retryCount: { lt: maxRetries } },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    return rows.map((row) => this.toDomain(row));
  }

  async deleteProcessedOlderThan(days: number): Promise<number> {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const { count } = await this.prisma.inboxEvent.deleteMany({
      where: { status: 'PROCESSED', processedAt: { lt: cutoff } },
    });
    return count;
  }

  private toDomain(row: InboxEventRow): InboxEvent {
    return {
      id: row.id,
      idempotencyKey: row.idempotencyKey,
      eventType: row.eventType,
      payload: row.payload,
      status: row.status as InboxEventStatus,
      processedAt: row.processedAt,
      errorMessage: row.errorMessage,
      retryCount: row.retryCount,
      createdAt: row.createdAt,
    };
  }
}
