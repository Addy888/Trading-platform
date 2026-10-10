import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { BrokerConnectionService } from './broker-connection.service';
import { AngelOneAdapter } from './providers/angelone/angelone.adapter';
import { ConnectionStatusDto, BrokerStatus } from './dto/connection-status.dto';
import { AccountSummaryDto } from './dto/account-summary.dto';
import { BrokerCredentials } from './interfaces/broker-provider.interface';

/**
 * Main broker service
 * Orchestrates broker operations and manages provider adapters
 */
@Injectable()
export class BrokerService {
  private readonly logger = new Logger(BrokerService.name);

  constructor(
    private connectionService: BrokerConnectionService,
    private angelOneAdapter: AngelOneAdapter,
  ) {}

  /**
   * Get connection status for a user
   */
  async getConnectionStatus(userId: string, provider: string = 'ANGELONE'): Promise<ConnectionStatusDto> {
    return this.connectionService.getConnectionStatus(userId, provider);
  }

  /**
   * Connect to broker (authenticate)
   * Stores encrypted session tokens in database
   */
  async connect(userId: string, credentials: BrokerCredentials, provider: string = 'ANGELONE'): Promise<ConnectionStatusDto> {
    this.logger.log(`Connecting user ${userId} to ${provider}...`);

    try {
      // Get the appropriate adapter
      const adapter = this.getAdapter(provider);

      // Authenticate with broker
      const session = await adapter.connect(credentials);

      // Get profile for metadata
      const profile = await adapter.getProfile(session.accessToken);

      // Save connection to database
      await this.connectionService.saveConnection(
        userId,
        provider,
        session.accessToken,
        session.refreshToken,
        session.expiresAt,
        profile.clientId,
        {
          ...session.metadata,
          profile,
        },
      );

      this.logger.log(`✓ User ${userId} connected to ${provider}`);

      return {
        provider,
        status: BrokerStatus.CONNECTED,
        lastConnectedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`Connection failed for user ${userId}: ${(error as Error).message}`);

      // Save error status
      if (error instanceof HttpException) {
        const response: any = error.getResponse();
        await this.connectionService.updateConnectionStatus(
          userId,
          provider,
          BrokerStatus.ERROR,
          response.message || 'Connection failed',
          response.code,
        );
      }

      throw error;
    }
  }

  /**
   * Disconnect from broker
   */
  async disconnect(userId: string, provider: string = 'ANGELONE'): Promise<void> {
    this.logger.log(`Disconnecting user ${userId} from ${provider}...`);

    try {
      // Get session token
      const sessionToken = await this.connectionService.getSessionToken(userId, provider);

      // Get adapter
      const adapter = this.getAdapter(provider);

      // Disconnect from broker
      await adapter.disconnect(sessionToken);

      // Delete connection from database
      await this.connectionService.deleteConnection(userId, provider);

      this.logger.log(`✓ User ${userId} disconnected from ${provider}`);
    } catch (error) {
      this.logger.error(`Disconnect failed: ${(error as Error).message}`);
      // Still delete the connection even if broker disconnect fails
      await this.connectionService.deleteConnection(userId, provider);
    }
  }

  /**
   * Get account summary from broker
   */
  async getAccountSummary(userId: string, provider: string = 'ANGELONE'): Promise<AccountSummaryDto> {
    this.logger.log(`Fetching account summary for user ${userId}, provider ${provider}`);

    try {
      // Get session token
      const sessionToken = await this.connectionService.getSessionToken(userId, provider);

      // Get adapter
      const adapter = this.getAdapter(provider);

      // Check if session is still valid
      const isValid = await adapter.isSessionValid(sessionToken);
      if (!isValid) {
        await this.connectionService.updateConnectionStatus(
          userId,
          provider,
          BrokerStatus.EXPIRED,
          'Session expired',
        );

        throw new HttpException(
          {
            error: 'BROKER_SESSION_EXPIRED',
            message: 'Session expired, please reconnect',
          },
          HttpStatus.UNAUTHORIZED,
        );
      }

      // Fetch account summary
      const summary = await adapter.getAccountSummary(sessionToken);

      this.logger.log(`✓ Account summary fetched successfully`);

      return summary;
    } catch (error) {
      this.logger.error(`Failed to fetch account summary: ${(error as Error).message}`);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          error: 'BROKER_API_ERROR',
          message: 'Failed to fetch account summary',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Validate broker session
   */
  async validateSession(userId: string, provider: string = 'ANGELONE'): Promise<boolean> {
    try {
      const sessionToken = await this.connectionService.getSessionToken(userId, provider);
      const adapter = this.getAdapter(provider);
      return await adapter.isSessionValid(sessionToken);
    } catch (error) {
      return false;
    }
  }

  /**
   * Get the appropriate broker adapter
   */
  private getAdapter(provider: string) {
    switch (provider.toUpperCase()) {
      case 'ANGELONE':
        return this.angelOneAdapter;
      default:
        throw new HttpException(
          {
            error: 'UNSUPPORTED_PROVIDER',
            message: `Broker provider ${provider} is not supported`,
          },
          HttpStatus.BAD_REQUEST,
        );
    }
  }
}
