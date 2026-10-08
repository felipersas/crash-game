/**
 * Test Environment for E2E Tests
 *
 * Uses Testcontainers DockerComposeEnvironment with docker-compose.test.yml.
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

import {
  DockerComposeEnvironment,
  Wait,
  type StartedDockerComposeEnvironment,
  type StartedTestContainer,
} from 'testcontainers';
import path from 'path';

export interface ComposeEnvironmentConfig {
  /** Additional environment variables */
  env?: Record<string, string>;
}

/**
 * Test environment wrapper for E2E tests.
 *
 * Manages all containers (PostgreSQL, RabbitMQ, Games, Wallets) via Docker Compose.
 */
export class TestCompose {
  private static environment?: StartedDockerComposeEnvironment;
  private static containers: Map<string, StartedTestContainer> = new Map();
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

    // Resolve path to docker-compose.test.yml (from monorepo root)
    // __dirname = services/games/tests/e2e/helpers
    // Need to go up 6 levels to reach monorepo root
    const composeFilePath = path.resolve(__dirname, '../../../../..');
    const composeFile = 'docker-compose.test.yml';

    console.log(`[TestCompose] Using compose file: ${path.join(composeFilePath, composeFile)}`);

    // Build environment variables for compose
    const composeEnv = {
      NODE_ENV: 'test',
      DETERMINISTIC_SEED: 'test-crash-2-94',
      ...config.env,
    };

    // Start Docker Compose environment
    this.environment = await new DockerComposeEnvironment(composeFilePath, composeFile)
      .withWaitStrategy('postgres-1', Wait.forHealthCheck())
      .withWaitStrategy('rabbitmq-1', Wait.forHealthCheck())
      .withWaitStrategy('redis-1', Wait.forHealthCheck())
      .withWaitStrategy('games-1', Wait.forHealthCheck())
      .withWaitStrategy('wallets-1', Wait.forHealthCheck())
      .withEnvironment(composeEnv)
      .up();

    console.log('[TestCompose] Docker Compose environment started');

    // Get container references
    const postgres = this.environment.getContainer('postgres-1');
    const rabbitmq = this.environment.getContainer('rabbitmq-1');
    const games = this.environment.getContainer('games-1');
    const wallets = this.environment.getContainer('wallets-1');

    this.containers.set('postgres', postgres);
    this.containers.set('rabbitmq', rabbitmq);
    this.containers.set('games', games);
    this.containers.set('wallets', wallets);

    // Get mapped ports
    const pgPort = postgres.getMappedPort(5432);
    const mqPort = rabbitmq.getMappedPort(5672);
    const gamesPort = games.getMappedPort(4001);
    const walletsPort = wallets.getMappedPort(4002);

    console.log(`[TestCompose] PostgreSQL: localhost:${pgPort}`);
    console.log(`[TestCompose] RabbitMQ: localhost:${mqPort}`);
    console.log(`[TestCompose] Games: localhost:${gamesPort}`);
    console.log(`[TestCompose] Wallets: localhost:${walletsPort}`);

    // Build connection URIs
    this.connections = {
      postgresGames: `postgresql://admin:admin@localhost:${pgPort}/games`,
      postgresWallets: `postgresql://admin:admin@localhost:${pgPort}/wallets`,
      postgresHost: 'localhost',
      postgresPort: pgPort.toString(),
      rabbitmqUrl: `amqp://admin:admin@localhost:${mqPort}`,
      rabbitmqHost: 'localhost',
      rabbitmqPort: mqPort.toString(),
      gamesUrl: `http://localhost:${gamesPort}`,
      walletsUrl: `http://localhost:${walletsPort}`,
      gamesHost: 'localhost',
      gamesPort: gamesPort.toString(),
      walletsHost: 'localhost',
      walletsPort: walletsPort.toString(),
    };

    console.log('[TestCompose] Environment ready');
    return this.connections;
  }

  /**
   * Stop all containers and clean up.
   */
  static async stop(): Promise<void> {
    console.log('[TestCompose] Stopping environment...');

    if (this.environment) {
      await this.environment.down({ removeVolumes: true, timeout: 30000 });
      this.environment = undefined;
      this.containers.clear();
      this.connections = undefined;
    }

    console.log('[TestCompose] Environment stopped');
  }

  /**
   * Get a container by name.
   */
  static getContainer(name: string): StartedTestContainer | undefined {
    // Handle both service name and container name formats
    const normalizedName = name.replace('-1', '');
    return this.containers.get(normalizedName);
  }

  /**
   * Execute a command in a container.
   */
  static async exec(
    containerName: string,
    command: string[],
  ): Promise<{ output: string; exitCode: number }> {
    const container = this.getContainer(containerName);
    if (!container) {
      throw new Error(`Container not found: ${containerName}`);
    }
    return await container.exec(command);
  }

  /**
   * Execute a command in PostgreSQL container.
   */
  static async execPostgres(command: string[]): Promise<{ output: string; exitCode: number }> {
    return await this.exec('postgres', command);
  }

  /**
   * Execute a command in RabbitMQ container.
   */
  static async execRabbitMQ(command: string[]): Promise<{ output: string; exitCode: number }> {
    return await this.exec('rabbitmq', command);
  }
}

/**
 * Global test setup exports
 */

export async function beforeAllTests(
  config?: ComposeEnvironmentConfig,
): Promise<Record<string, string>> {
  return await TestCompose.start(config);
}

export async function afterAllTests(): Promise<void> {
  await TestCompose.stop();
}
