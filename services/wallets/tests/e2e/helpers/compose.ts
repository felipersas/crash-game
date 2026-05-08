/**
 * Docker Compose Environment for E2E Tests
 *
 * Simplified Testcontainers wrapper for integration testing.
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

import { DockerComposeEnvironment, StartedDockerComposeEnvironment } from 'testcontainers';
import path from 'path';

const projectRoot = path.resolve(__dirname, '../../../../..');

export interface ComposeEnvironmentConfig {
  /** Services to start (default: all) */
  services?: string[];
  /** Additional environment variables */
  env?: Record<string, string>;
  /** Keep containers running after tests (for debugging) */
  keepRunning?: boolean;
}

/**
 * Docker Compose environment wrapper for E2E tests.
 *
 * Manages the lifecycle of Docker containers used in integration tests.
 */
export class TestCompose {
  private static instance?: StartedDockerComposeEnvironment;

  /**
   * Start the Docker Compose environment.
   *
   * @param config - Configuration options
   * @returns Connection URIs map
   */
  static async start(config: ComposeEnvironmentConfig = {}): Promise<Record<string, string>> {
    const { services = [], env = {} } = config;

    // Stop any existing environment first
    if (this.instance) {
      await this.stop();
    }

    const composeFiles = ['docker-compose.test.yml'];

    console.log('[TestCompose] Starting environment with services:', services.length > 0 ? services : 'all');

    const builder = new DockerComposeEnvironment(projectRoot, composeFiles)
      .withEnvironment({
        NODE_ENV: 'test',
        ...env,
      })
      .withBuild(); // Build images before starting

    this.instance = await builder.up(services.length > 0 ? services : undefined);

    // Build connection URIs for common services
    const connections: Record<string, string> = {};

    // PostgreSQL
    try {
      const container = this.instance.getContainer('postgres-1');
      const host = container.getHost();
      const port = container.getMappedPort(5432);

      connections['postgresGames'] = `postgresql://admin:admin@${host}:${port}/games`;
      connections['postgresWallets'] = `postgresql://admin:admin@${host}:${port}/wallets`;
      connections['postgresHost'] = host;
      connections['postgresPort'] = port.toString();
    } catch (e) {
      console.warn('[TestCompose] PostgreSQL container not available');
    }

    // RabbitMQ
    try {
      const rabbitmq = this.instance.getContainer('rabbitmq-1');
      const host = rabbitmq.getHost();
      const amqpPort = rabbitmq.getMappedPort(5672);
      const mgmtPort = rabbitmq.getMappedPort(15672);

      connections['rabbitmqUrl'] = `amqp://admin:admin@${host}:${amqpPort}`;
      connections['rabbitmqHost'] = host;
      connections['rabbitmqPort'] = amqpPort.toString();
      connections['rabbitmqManagement'] = `http://${host}:${mgmtPort}`;
    } catch (e) {
      console.warn('[TestCompose] RabbitMQ container not available');
    }

    // Games Service
    try {
      const games = this.instance.getContainer('games-1');
      const host = games.getHost();
      const port = games.getMappedPort(4001);

      connections['gamesUrl'] = `http://${host}:${port}`;
      connections['gamesHost'] = host;
      connections['gamesPort'] = port.toString();
    } catch (e) {
      console.warn('[TestCompose] Games service container not available');
    }

    // Wallets Service
    try {
      const wallets = this.instance.getContainer('wallets-1');
      const host = wallets.getHost();
      const port = wallets.getMappedPort(4002);

      connections['walletsUrl'] = `http://${host}:${port}`;
      connections['walletsHost'] = host;
      connections['walletsPort'] = port.toString();
    } catch (e) {
      console.warn('[TestCompose] Wallets service container not available');
    }

    console.log('[TestCompose] Environment started');
    console.log('  Connections:', Object.keys(connections).join(', '));

    return connections;
  }

  /**
   * Get a container by service name.
   *
   * @param serviceName - Service name (with or without '-1' suffix)
   * @returns Container instance
   */
  static getContainer(serviceName: string) {
    if (!this.instance) {
      throw new Error('Environment not started. Call start() first.');
    }

    const containerName = serviceName.endsWith('-1') ? serviceName : `${serviceName}-1`;
    return this.instance.getContainer(containerName);
  }

  /**
   * Stop the Docker Compose environment.
   *
   * @param options - Stop options
   */
  static async stop(options = { removeVolumes: true, timeout: 30000 }): Promise<void> {
    if (this.instance) {
      console.log('[TestCompose] Stopping environment...');
      await this.instance.down(options);
      this.instance = undefined;
      console.log('[TestCompose] Environment stopped');
    }
  }

  /**
   * Execute a command in a container.
   *
   * @param containerName - Container name
   * @param command - Command to execute
   * @returns Execution result with output and exit code
   */
  static async exec(containerName: string, command: string[]): Promise<{ output: string; exitCode: number }> {
    const container = this.getContainer(containerName);
    const result = await container.exec(command);
    return result;
  }

  /**
   * Wait for a service to be healthy by polling its health endpoint.
   *
   * @param url - Health check URL
   * @param timeout - Maximum time to wait in ms
   */
  static async waitForHealthCheck(url: string, timeout = 60000): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          console.log(`[TestCompose] Health check passed: ${url}`);
          return;
        }
      } catch {
        // Service not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error(`Health check failed for ${url} (timeout: ${timeout}ms)`);
  }

  /**
   * Get the current instance (for advanced use cases).
   */
  static getInstance(): StartedDockerComposeEnvironment | undefined {
    return this.instance;
  }
}

/**
 * Global test setup exports
 */

export async function beforeAllTests(config?: ComposeEnvironmentConfig): Promise<Record<string, string>> {
  const connections = await TestCompose.start(config);

  // Wait for services to be healthy
  if (connections.gamesUrl) {
    await TestCompose.waitForHealthCheck(`${connections.gamesUrl}/health`);
  }
  if (connections.walletsUrl) {
    await TestCompose.waitForHealthCheck(`${connections.walletsUrl}/health`);
  }

  return connections;
}

export async function afterAllTests(): Promise<void> {
  await TestCompose.stop();
}
