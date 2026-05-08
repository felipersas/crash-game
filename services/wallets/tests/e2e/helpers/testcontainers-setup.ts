/**
 * E2E Test Setup with Testcontainers
 *
 * Provides Docker Compose environment management for integration tests.
 * Uses Testcontainers Node to orchestrate PostgreSQL, RabbitMQ, and application services.
 */

import { DockerComposeEnvironment, Wait } from 'testcontainers';
import path from 'path';

export interface TestContainersConfig {
  composeFile?: string;
  environment?: Record<string, string>;
}

export interface ServiceConnection {
  host: string;
  port: number;
}

export class TestContainersSetup {
  private static instance: TestContainersSetup | null = null;
  private environment: any | null = null;
  private composeFilePath: string;
  private composeFile: string;

  private constructor(config: TestContainersConfig = {}) {
    // Navigate from tests/e2e/helpers to project root
    this.composeFilePath = path.resolve(__dirname, '../../../../..');
    this.composeFile = config.composeFile || 'docker-compose.test.yml';
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: TestContainersConfig): TestContainersSetup {
    if (!TestContainersSetup.instance) {
      TestContainersSetup.instance = new TestContainersSetup(config);
    }
    return TestContainersSetup.instance;
  }

  /**
   * Start Docker Compose environment
   */
  async start(config?: TestContainersConfig): Promise<void> {
    if (this.environment) {
      return; // Already started
    }

    const builder = new DockerComposeEnvironment(
      this.composeFilePath,
      config?.composeFile || this.composeFile,
    );

    // Add environment variables if provided
    if (config?.environment) {
      builder.withEnvironment(config.environment);
    }

    // Wait for infrastructure services to be healthy
    builder.withWaitStrategy('postgres-1', Wait.forHealthCheck());
    builder.withWaitStrategy('rabbitmq-1', Wait.forHealthCheck());

    // Wait for application services to be healthy
    builder.withWaitStrategy('games-1', Wait.forHealthCheck());
    builder.withWaitStrategy('wallets-1', Wait.forHealthCheck());

    // Build images before starting
    builder.withBuild();

    this.environment = await builder.up();

    console.log('✓ Testcontainers environment started');
    console.log('  - PostgreSQL: localhost:5432');
    console.log('  - RabbitMQ: localhost:5672');
    console.log('  - Games Service: http://localhost:4001');
    console.log('  - Wallets Service: http://localhost:4002');
  }

  /**
   * Stop Docker Compose environment
   */
  async stop(): Promise<void> {
    if (!this.environment) {
      return;
    }

    await this.environment.down({ removeVolumes: true, timeout: 30_000 });
    this.environment = null;

    console.log('✓ Testcontainers environment stopped');
  }

  /**
   * Get PostgreSQL connection details
   */
  getPostgresConnection(): ServiceConnection {
    if (!this.environment) {
      throw new Error('Environment not started. Call start() first.');
    }

    const container = this.environment.getContainer('postgres-1');
    return {
      host: container.getHost(),
      port: container.getMappedPort(5432),
    };
  }

  /**
   * Get RabbitMQ connection details
   */
  getRabbitMQConnection(): ServiceConnection {
    if (!this.environment) {
      throw new Error('Environment not started. Call start() first.');
    }

    const container = this.environment.getContainer('rabbitmq-1');
    return {
      host: container.getHost(),
      port: container.getMappedPort(5672),
    };
  }

  /**
   * Get Games service connection details
   */
  getGamesServiceConnection(): ServiceConnection {
    if (!this.environment) {
      throw new Error('Environment not started. Call start() first.');
    }

    const container = this.environment.getContainer('games-1');
    return {
      host: container.getHost(),
      port: container.getMappedPort(4001),
    };
  }

  /**
   * Get Wallets service connection details
   */
  getWalletsServiceConnection(): ServiceConnection {
    if (!this.environment) {
      throw new Error('Environment not started. Call start() first.');
    }

    const container = this.environment.getContainer('wallets-1');
    return {
      host: container.getHost(),
      port: container.getMappedPort(4002),
    };
  }

  /**
   * Get Games service URL
   */
  getGamesServiceUrl(): string {
    const { host, port } = this.getGamesServiceConnection();
    return `http://${host}:${port}`;
  }

  /**
   * Get Wallets service URL
   */
  getWalletsServiceUrl(): string {
    const { host, port } = this.getWalletsServiceConnection();
    return `http://${host}:${port}`;
  }

  /**
   * Get PostgreSQL connection string for wallets service
   */
  getPostgresConnectionString(): string {
    const { host, port } = this.getPostgresConnection();
    return `postgresql://admin:admin@${host}:${port}/wallets`;
  }

  /**
   * Get RabbitMQ connection string (AMQP)
   */
  getRabbitMQConnectionString(): string {
    const { host, port } = this.getRabbitMQConnection();
    return `amqp://admin:admin@${host}:${port}`;
  }

  /**
   * Execute command in PostgreSQL container
   */
  async execPostgres(command: string[]): Promise<{ output: string; exitCode: number }> {
    if (!this.environment) {
      throw new Error('Environment not started. Call start() first.');
    }

    const container = this.environment.getContainer('postgres-1');
    return await container.exec(command);
  }

  /**
   * Execute command in RabbitMQ container
   */
  async execRabbitMQ(command: string[]): Promise<{ output: string; exitCode: number }> {
    if (!this.environment) {
      throw new Error('Environment not started. Call start() first.');
    }

    const container = this.environment.getContainer('rabbitmq-1');
    return await container.exec(command);
  }

  /**
   * Execute command in Games service container
   */
  async execGames(command: string[]): Promise<{ output: string; exitCode: number }> {
    if (!this.environment) {
      throw new Error('Environment not started. Call start() first.');
    }

    const container = this.environment.getContainer('games-1');
    return await container.exec(command);
  }

  /**
   * Execute command in Wallets service container
   */
  async execWallets(command: string[]): Promise<{ output: string; exitCode: number }> {
    if (!this.environment) {
      throw new Error('Environment not started. Call start() first.');
    }

    const container = this.environment.getContainer('wallets-1');
    return await container.exec(command);
  }

  /**
   * Wait for Wallets service to be healthy
   */
  async waitForWalletsService(timeout = 60000): Promise<void> {
    const startTime = Date.now();
    const url = this.getWalletsServiceUrl();

    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(`${url}/health`);
        if (response.ok) {
          console.log('✓ Wallets service is healthy');
          return;
        }
      } catch {
        // Service not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Wallets service did not become healthy in time');
  }
}

/**
 * Global test setup fixture
 * Creates a singleton instance that persists across test suites
 */
export const testContainers = TestContainersSetup.getInstance();

/**
 * Before all tests - start the environment
 */
export async function beforeAllTests(): Promise<void> {
  await testContainers.start();

  // Wait for services to be ready
  await testContainers.waitForWalletsService();
}

/**
 * After all tests - stop the environment
 */
export async function afterAllTests(): Promise<void> {
  await testContainers.stop();
}
