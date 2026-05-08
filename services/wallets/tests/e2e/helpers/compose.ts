/**
 * Test Environment for E2E Tests
 *
 * Uses Testcontainers for infra (PostgreSQL, RabbitMQ) + Bun for services.
 *
 * @example
 * ```typescript
 * import { beforeAll, afterAll } from 'bun:test';
 * import { TestCompose } from './helpers/compose';
 *
 * beforeAll(async () => {
 *   const connections = await TestCompose.start();
 *   // connections.gamesUrl, connections.walletsUrl, etc.
 * });
 *
 * afterAll(async () => {
 *   await TestCompose.stop();
 * });
 * ```
 */

import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { spawn } from 'child_process';

export interface ComposeEnvironmentConfig {
  /** Additional environment variables */
  env?: Record<string, string>;
}

/**
 * Test environment wrapper for E2E tests.
 *
 * Manages infra containers via Testcontainers + services via Bun processes.
 */
export class TestCompose {
  private static postgres?: StartedTestContainer;
  private static rabbitmq?: StartedTestContainer;
  private static gamesProcess?: ReturnType<typeof spawn>;
  private static walletsProcess?: ReturnType<typeof spawn>;
  private static connections?: Record<string, string>;

  /**
   * Start the test environment (singleton).
   *
   * @param config - Configuration options
   * @returns Connection URIs map
   */
  static async start(config: ComposeEnvironmentConfig = {}): Promise<Record<string, string>> {
    // Return existing connections if already started
    if (this.connections) {
      console.log('[TestCompose] Using existing environment');
      return this.connections;
    }

    console.log('[TestCompose] Starting test environment...');

    // Start PostgreSQL
    console.log('[TestCompose] Starting PostgreSQL container...');
    this.postgres = await new GenericContainer('postgres:18.3-alpine')
      .withEnvironment({
        POSTGRES_USER: 'admin',
        POSTGRES_PASSWORD: 'admin',
        POSTGRES_DB: 'postgres',
      })
      .withExposedPorts(5432)
      .start();

    const pgHost = this.postgres.getHost();
    const pgPort = this.postgres.getMappedPort(5432);
    console.log(`[TestCompose] PostgreSQL ready at ${pgHost}:${pgPort}`);

    // Create databases
    await this.postgres.exec(['psql', '-U', 'admin', '-c', 'CREATE DATABASE games;']);
    await this.postgres.exec(['psql', '-U', 'admin', '-c', 'CREATE DATABASE wallets;']);

    // Start RabbitMQ
    console.log('[TestCompose] Starting RabbitMQ container...');
    this.rabbitmq = await new GenericContainer('rabbitmq:4.2.4-management-alpine')
      .withEnvironment({
        RABBITMQ_DEFAULT_USER: 'admin',
        RABBITMQ_DEFAULT_PASS: 'admin',
      })
      .withExposedPorts(5672, 15672)
      .start();

    const mqHost = this.rabbitmq.getHost();
    const mqPort = this.rabbitmq.getMappedPort(5672);
    console.log(`[TestCompose] RabbitMQ ready at ${mqHost}:${mqPort}`);

    // Build connection URIs
    const gamesUrl = 'http://localhost:4001';
    const walletsUrl = 'http://localhost:4002';

    this.connections = {
      postgresGames: `postgresql://admin:admin@${pgHost}:${pgPort}/games`,
      postgresWallets: `postgresql://admin:admin@${pgHost}:${pgPort}/wallets`,
      postgresHost: pgHost,
      postgresPort: pgPort.toString(),
      rabbitmqUrl: `amqp://admin:admin@${mqHost}:${mqPort}`,
      rabbitmqHost: mqHost,
      rabbitmqPort: mqPort.toString(),
      gamesUrl,
      walletsUrl,
    };

    // Start Games service
    console.log('[TestCompose] Starting Games service...');
    this.gamesProcess = spawn('bun', ['run', 'start'], {
      cwd: '/Users/felipersas/Documents/JungleGaming/fullstack-challenge/services/games',
      env: {
        ...process.env,
        DATABASE_URL: this.connections.postgresGames,
        RABBITMQ_URL: this.connections.rabbitmqUrl,
        NODE_ENV: 'test',
        PORT: '4001',
      },
      stdio: 'pipe',
    });

    this.gamesProcess.stdout?.on('data', (data) => {
      console.log('[Games]', data.toString().trim());
    });
    this.gamesProcess.stderr?.on('data', (data) => {
      console.error('[Games ERROR]', data.toString().trim());
    });

    // Start Wallets service
    console.log('[TestCompose] Starting Wallets service...');
    this.walletsProcess = spawn('bun', ['run', 'start'], {
      cwd: '/Users/felipersas/Documents/JungleGaming/fullstack-challenge/services/wallets',
      env: {
        ...process.env,
        DATABASE_URL: this.connections.postgresWallets,
        RABBITMQ_URL: this.connections.rabbitmqUrl,
        NODE_ENV: 'test',
        PORT: '4002',
      },
      stdio: 'pipe',
    });

    this.walletsProcess.stdout?.on('data', (data) => {
      console.log('[Wallets]', data.toString().trim());
    });
    this.walletsProcess.stderr?.on('data', (data) => {
      console.error('[Wallets ERROR]', data.toString().trim());
    });

    // Wait for services to be ready
    console.log('[TestCompose] Waiting for services to be ready...');
    await this.waitForService(gamesUrl, '/health', 60000);
    await this.waitForService(walletsUrl, '/health', 60000);

    console.log('[TestCompose] Environment started');
    return this.connections;
  }

  /**
   * Wait for a service to respond.
   */
  private static async waitForService(baseUrl: string, path: string, timeout: number): Promise<void> {
    const start = Date.now();
    const url = baseUrl + path;

    while (Date.now() - start < timeout) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          console.log(`[TestCompose] Service ready: ${baseUrl}`);
          return;
        }
      } catch {
        // Service not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error(`Service not ready: ${baseUrl} (timeout: ${timeout}ms)`);
  }

  /**
   * Stop all containers and processes.
   */
  static async stop(): Promise<void> {
    console.log('[TestCompose] Stopping environment...');

    if (this.gamesProcess) {
      this.gamesProcess.kill();
      this.gamesProcess = undefined;
    }
    if (this.walletsProcess) {
      this.walletsProcess.kill();
      this.walletsProcess = undefined;
    }
    if (this.postgres) {
      await this.postgres.stop();
      this.postgres = undefined;
    }
    if (this.rabbitmq) {
      await this.rabbitmq.stop();
      this.rabbitmq = undefined;
    }

    this.connections = undefined;
    console.log('[TestCompose] Environment stopped');
  }

  /**
   * Execute a command in PostgreSQL container.
   */
  static async execPostgres(command: string[]): Promise<{ output: string; exitCode: number }> {
    if (!this.postgres) {
      throw new Error('Environment not started');
    }
    return await this.postgres.exec(command);
  }

  /**
   * Execute a command in RabbitMQ container.
   */
  static async execRabbitMQ(command: string[]): Promise<{ output: string; exitCode: number }> {
    if (!this.rabbitmq) {
      throw new Error('Environment not started');
    }
    return await this.rabbitmq.exec(command);
  }

  /**
   * Get a container by name (for compatibility).
   */
  static getContainer(name: string) {
    if (name === 'postgres-1' || name === 'postgres') {
      return this.postgres;
    }
    if (name === 'rabbitmq-1' || name === 'rabbitmq') {
      return this.rabbitmq;
    }
    throw new Error(`Unknown container: ${name}`);
  }

  /**
   * Execute a command in a container (compatibility method).
   */
  static async exec(containerName: string, command: string[]): Promise<{ output: string; exitCode: number }> {
    if (containerName.startsWith('postgres')) {
      return await this.execPostgres(command);
    }
    if (containerName.startsWith('rabbitmq')) {
      return await this.execRabbitMQ(command);
    }
    throw new Error(`Unknown container: ${containerName}`);
  }
}

/**
 * Global test setup exports
 */

export async function beforeAllTests(config?: ComposeEnvironmentConfig): Promise<Record<string, string>> {
  return await TestCompose.start(config);
}

export async function afterAllTests(): Promise<void> {
  await TestCompose.stop();
}
