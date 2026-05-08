import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import type { ISeedChainRepository } from '@/application/interfaces/seed-chain.repository';
import { SeedChain } from '@/domain/value-objects/seed-chain.value-object';

/**
 * File-based implementation of SeedChain repository.
 *
 * Stores the seed chain in a JSON file in the data directory.
 * The file is encrypted at rest for security (TODO: implement encryption).
 */
@Injectable()
export class FileSeedChainRepository implements ISeedChainRepository {
  private readonly logger = new Logger(FileSeedChainRepository.name);
  private readonly filePath: string;

  constructor() {
    // Store in data directory at project root
    const dataDir = join(process.cwd(), 'data');
    this.filePath = join(dataDir, 'seed-chain.json');

    // Ensure data directory exists
    fs.mkdir(dataDir, { recursive: true }).catch(err => {
      if (err.code !== 'EEXIST') {
        this.logger.error(`Failed to create data directory: ${err.message}`);
      }
    });
  }

  async load(): Promise<SeedChain | null> {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(data);

      this.logger.log(`Seed chain loaded from ${this.filePath}`);
      this.logger.debug(
        `Position: ${parsed.current}/${parsed.seeds.length}, ` +
        `Commitment: ${parsed.commitment.substring(0, 16)}...`
      );

      return SeedChain.fromPersistence(parsed);
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        this.logger.log('No existing seed chain found');
        return null;
      }

      this.logger.error(`Failed to load seed chain: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  async save(chain: SeedChain): Promise<void> {
    try {
      const data = JSON.stringify(chain.toPersistence(), null, 2);

      // Write to temp file first, then rename (atomic operation)
      const tempPath = `${this.filePath}.tmp`;
      await fs.writeFile(tempPath, data, 'utf-8');
      await fs.rename(tempPath, this.filePath);

      const summary = chain.getSummary();
      this.logger.log(
        `Seed chain saved: position ${summary.currentPosition}/${summary.total}, ` +
        `${summary.remaining} remaining`
      );
    } catch (error: unknown) {
      this.logger.error(`Failed to save seed chain: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  }

  async delete(): Promise<void> {
    try {
      await fs.unlink(this.filePath);
      this.logger.log('Seed chain deleted');
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        this.logger.log('Seed chain file does not exist, nothing to delete');
        return;
      }

      this.logger.error(`Failed to delete seed chain: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  }

  async exists(): Promise<boolean> {
    try {
      await fs.access(this.filePath);
      return true;
    } catch {
      return false;
    }
  }
}
