import { describe, test, expect, beforeEach } from 'bun:test';
import { IdempotentInbox } from '@/infrastructure/messaging/inbox/idempotent-inbox';
import type {
  InboxEvent,
  InboxEventCreateInput,
  InboxEventStatus,
} from '@/application/interfaces/inbox.repository';
import { mockFn } from '../../helpers/mocks';

const KEY = 'debit-bet-1';
const TYPE = 'WalletDebited';
const PAYLOAD = { betId: 'bet-1', amountCents: '1000' };

function inboxEvent(status: InboxEventStatus, id = 'inbox-1'): InboxEvent {
  return {
    id,
    idempotencyKey: KEY,
    eventType: TYPE,
    payload: PAYLOAD,
    status,
    processedAt: status === 'PROCESSED' ? new Date() : null,
    errorMessage: status === 'FAILED' ? 'previous failure' : null,
    retryCount: status === 'FAILED' ? 1 : 0,
    createdAt: new Date(),
  };
}

function createMockInboxRepository() {
  return {
    tryCreate: mockFn(
      async (_input: InboxEventCreateInput): Promise<InboxEvent | null> => inboxEvent('PENDING'),
    ),
    findByIdempotencyKey: mockFn(async (_key: string): Promise<InboxEvent | null> => null),
    markAsProcessed: mockFn(async (_id: string) => {}),
    markAsFailed: mockFn(async (_id: string, _errorMessage: string) => {}),
    findFailed: mockFn(async (_maxRetries: number): Promise<InboxEvent[]> => []),
    deleteProcessedOlderThan: mockFn(async (_days: number) => 0),
  };
}

describe('IdempotentInbox', () => {
  let inboxRepository: ReturnType<typeof createMockInboxRepository>;
  let inbox: IdempotentInbox;
  let handler: ReturnType<typeof mockFn<() => Promise<void>>>;

  beforeEach(() => {
    inboxRepository = createMockInboxRepository();
    inbox = new IdempotentInbox(inboxRepository);
    const logger = (inbox as any).logger;
    logger.log = () => {};
    logger.warn = () => {};
    logger.error = () => {};
    handler = mockFn(async () => {});
  });

  describe('first delivery', () => {
    test('should record the event, run the handler and mark it PROCESSED', async () => {
      await inbox.process(KEY, TYPE, PAYLOAD, handler);

      expect(inboxRepository.tryCreate.calls).toEqual([
        [{ idempotencyKey: KEY, eventType: TYPE, payload: PAYLOAD }],
      ]);
      expect(handler.callCount).toBe(1);
      expect(inboxRepository.markAsProcessed.calls).toEqual([['inbox-1']]);
      expect(inboxRepository.markAsFailed.callCount).toBe(0);
      expect(inboxRepository.findByIdempotencyKey.callCount).toBe(0);
    });

    test('should mark PROCESSED only after the handler completes', async () => {
      const order: string[] = [];
      handler.mockImplementation(async () => {
        order.push('handler');
      });
      inboxRepository.markAsProcessed.mockImplementation(async () => {
        order.push('markAsProcessed');
      });

      await inbox.process(KEY, TYPE, PAYLOAD, handler);

      expect(order).toEqual(['handler', 'markAsProcessed']);
    });
  });

  describe('duplicate delivery', () => {
    beforeEach(() => {
      inboxRepository.tryCreate.mockResolvedValue(null);
    });

    test('should skip an event already PROCESSED', async () => {
      inboxRepository.findByIdempotencyKey.mockResolvedValue(inboxEvent('PROCESSED'));

      await inbox.process(KEY, TYPE, PAYLOAD, handler);

      expect(inboxRepository.findByIdempotencyKey.calls).toEqual([[KEY]]);
      expect(handler.callCount).toBe(0);
      expect(inboxRepository.markAsProcessed.callCount).toBe(0);
      expect(inboxRepository.markAsFailed.callCount).toBe(0);
    });

    test('should skip an event still PENDING (in flight)', async () => {
      inboxRepository.findByIdempotencyKey.mockResolvedValue(inboxEvent('PENDING'));

      await inbox.process(KEY, TYPE, PAYLOAD, handler);

      expect(handler.callCount).toBe(0);
      expect(inboxRepository.markAsProcessed.callCount).toBe(0);
    });

    test('should retry a stale PENDING event (process died mid-handling)', async () => {
      const stale = {
        ...inboxEvent('PENDING', 'inbox-stale'),
        createdAt: new Date(Date.now() - 120_000),
      };
      inboxRepository.findByIdempotencyKey.mockResolvedValue(stale);

      await inbox.process(KEY, TYPE, PAYLOAD, handler);

      expect(handler.callCount).toBe(1);
      expect(inboxRepository.markAsProcessed.calls).toEqual([['inbox-stale']]);
    });

    test('should retry an event that previously FAILED', async () => {
      inboxRepository.findByIdempotencyKey.mockResolvedValue(inboxEvent('FAILED', 'inbox-failed'));

      await inbox.process(KEY, TYPE, PAYLOAD, handler);

      expect(handler.callCount).toBe(1);
      expect(inboxRepository.markAsProcessed.calls).toEqual([['inbox-failed']]);
    });

    test('should skip when the existing row cannot be found', async () => {
      inboxRepository.findByIdempotencyKey.mockResolvedValue(null);

      await inbox.process(KEY, TYPE, PAYLOAD, handler);

      expect(handler.callCount).toBe(0);
    });
  });

  describe('handler failure', () => {
    test('should mark the event FAILED with the error message and rethrow', async () => {
      const error = new Error('Bet not found');
      handler.mockRejectedValue(error);

      await expect(inbox.process(KEY, TYPE, PAYLOAD, handler)).rejects.toBe(error);

      expect(inboxRepository.markAsFailed.calls).toEqual([['inbox-1', 'Bet not found']]);
      expect(inboxRepository.markAsProcessed.callCount).toBe(0);
    });

    test('should stringify non-Error rejections', async () => {
      handler.mockRejectedValue('plain failure');

      await expect(inbox.process(KEY, TYPE, PAYLOAD, handler)).rejects.toBe('plain failure');

      expect(inboxRepository.markAsFailed.calls).toEqual([['inbox-1', 'plain failure']]);
    });

    test('should mark a retried FAILED event FAILED again when the handler fails', async () => {
      inboxRepository.tryCreate.mockResolvedValue(null);
      inboxRepository.findByIdempotencyKey.mockResolvedValue(inboxEvent('FAILED', 'inbox-failed'));
      handler.mockRejectedValue(new Error('still failing'));

      await expect(inbox.process(KEY, TYPE, PAYLOAD, handler)).rejects.toThrow('still failing');

      expect(inboxRepository.markAsFailed.calls).toEqual([['inbox-failed', 'still failing']]);
    });

    test('should not run the handler when recording the event fails', async () => {
      inboxRepository.tryCreate.mockRejectedValue(new Error('db down'));

      await expect(inbox.process(KEY, TYPE, PAYLOAD, handler)).rejects.toThrow('db down');

      expect(handler.callCount).toBe(0);
      expect(inboxRepository.markAsFailed.callCount).toBe(0);
    });
  });
});
