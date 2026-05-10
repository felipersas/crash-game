import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join } from 'path';
import type { ISeedChainRepository } from '@/application/interfaces/seed-chain.repository';
import { SeedChain, type SeedChainData } from '@/domain/value-objects/seed-chain.value-object';
import { AesCipher } from '@/infrastructure/crypto/aes-cipher';

/**
 * File-based implementation of SeedChain repository.
 *
 * Stores the seed chain encrypted at rest using AES-256-GCM.
 * Automatically migrates plaintext files to encrypted format on next save.
 */
@Injectable()
export class FileSeedChainRepository implements ISeedChainRepository {
  private readonly logger = new Logger(FileSeedChainRepository.name);
  private readonly filePath: string;
  private readonly encryptionKeyBase64: string | undefined;

  constructor(private readonly configService: ConfigService) {
    // Store in data directory at project root
    const dataDir = join(process.cwd(), 'data');
    this.filePath = join(dataDir, 'seed-chain.json');
    this.encryptionKeyBase64 = this.configService.get<string>('SEED_CHAIN_ENCRYPTION_KEY');

    // Ensure data directory exists
    fs.mkdir(dataDir, { recursive: true }).catch((err) => {
      if (err.code !== 'EEXIST') {
        this.logger.error(`Failed to create data directory: ${err.message}`);
      }
    });

    if (!this.encryptionKeyBase64) {
      this.logger.warn(
        'SEED_CHAIN_ENCRYPTION_KEY not set — seed chain will be stored in plaintext. ' +
          'Generate a key with: openssl rand -base64 32',
      );
    }
  }

  async load(): Promise<SeedChain | null> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw);

      const chainData = await this.deserializeChainData(parsed);

      this.logger.log(`Seed chain loaded from ${this.filePath}`);
      this.logger.debug(
        `Position: ${chainData.current}/${chainData.seeds.length}, ` +
          `Commitment: ${chainData.commitment.substring(0, 16)}...`,
      );

      return SeedChain.fromPersistence({
        seeds: [...chainData.seeds],
        current: chainData.current,
        commitment: chainData.commitment,
      });
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        this.logger.log('No existing seed chain found');
        return null;
      }

      this.logger.error(
        `Failed to load seed chain: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }

  async save(chain: SeedChain): Promise<void> {
    try {
      const plaintext = JSON.stringify(chain.toPersistence());
      const output = await this.serializeChainData(plaintext);

      // Write to temp file first, then rename (atomic operation)
      const tempPath = `${this.filePath}.tmp`;
      await fs.writeFile(tempPath, output, 'utf-8');
      await fs.rename(tempPath, this.filePath);

      const summary = chain.getSummary();
      this.logger.log(
        `Seed chain saved: position ${summary.currentPosition}/${summary.total}, ` +
          `${summary.remaining} remaining`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `Failed to save seed chain: ${error instanceof Error ? error.message : error}`,
      );
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

      this.logger.error(
        `Failed to delete seed chain: ${error instanceof Error ? error.message : error}`,
      );
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

  /**
   * Deserialize chain data from file content.
   * Handles both encrypted (v1) and legacy plaintext formats.
   */
  private async deserializeChainData(parsed: unknown): Promise<SeedChainData> {
    // Encrypted format: { v: 1, iv: "...", data: "..." }
    if (AesCipher.isEncryptedPayload(parsed)) {
      if (!this.encryptionKeyBase64) {
        throw new Error(
          'Seed chain file is encrypted but SEED_CHAIN_ENCRYPTION_KEY is not configured',
        );
      }
      const key = await AesCipher.importKey(this.encryptionKeyBase64);
      const decrypted = await AesCipher.decrypt(parsed, key);
      return JSON.parse(decrypted) as SeedChainData;
    }

    // Legacy plaintext format: { seeds: [...], current: N, commitment: "..." }
    if (typeof parsed === 'object' && parsed !== null && 'seeds' in parsed && 'current' in parsed) {
      this.logger.warn(
        'Seed chain file is stored in plaintext — it will be encrypted on next save',
      );
      return parsed as SeedChainData;
    }

    throw new Error('Invalid seed chain file format');
  }

  /**
   * Serialize chain data to string for file storage.
   * Encrypts if key is configured, otherwise writes plaintext.
   */
  private async serializeChainData(plaintext: string): Promise<string> {
    if (!this.encryptionKeyBase64) {
      return plaintext;
    }

    const key = await AesCipher.importKey(this.encryptionKeyBase64);
    const encrypted = await AesCipher.encrypt(plaintext, key);
    return JSON.stringify(encrypted);
  }
}
