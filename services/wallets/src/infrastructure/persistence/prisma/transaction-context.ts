import type { Prisma } from '@prisma/client';
import type { TransactionContext } from '@/application/interfaces/unit-of-work';
import type { PrismaService } from './prisma.service';

export type PrismaTransaction = Prisma.TransactionClient;

export function toTransactionContext(tx: PrismaTransaction): TransactionContext {
  return tx as unknown as TransactionContext;
}

/**
 * Resolves the client a repository should use: the open transaction when one
 * is provided, otherwise the root client.
 */
export function prismaClient(prisma: PrismaService, tx?: TransactionContext): PrismaTransaction {
  return (tx as unknown as PrismaTransaction | undefined) ?? prisma;
}
