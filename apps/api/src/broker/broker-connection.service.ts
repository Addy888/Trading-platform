import { Injectable, Logger, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { encrypt, decrypt } from './utils/encryption.util';
import { BrokerStatus, ConnectionStatusDto } from './dto/connection-status.dto';

/**
 * Service for managing broker connection records in the database
 * Handles secure storage and retrieval of broker credentials and session tokens
 */
@Injectable()
export class BrokerConnectionService {
  private readonly logger = new Logger(BrokerConnectionService.name);
  private readonly encryptionKey: string;

  constructor(private prisma: PrismaService) {
    // Get encryption key from environment
    this.encryptionKey = process.env.ANGELONE_ENCRYPTION_KEY || '';
    
    if (!this.encryptionKey || this.encryptionKey.length < 32) {
      this.logger.warn('⚠️  ANGELONE_ENCRYPTION_KEY not configured or too short. Broker credentials cannot be encrypted securely.');
    }
  }

  /**
   * Get connection status for a user
   * @param userId - User ID
   * @param provider - Broker provider (default: ANGELONE)
   */
  async getConnectionStatus(userId: string, provider: string = 'ANGELONE'): Promise<ConnectionStatusDto> {
    this.logger.log(`Fetching connection status for user ${userId}, provider ${provider}`);

    const connection = await this.prisma.brokerConnection.findUnique({
      where: {
        userId_provider: {
          userId,
          provider,
        },
      },
    });

    if (!connection) {
      return {
        provider,
        status: BrokerStatus.NOT_CONFIGURED,
      };
    }

    // Check if token is expired
    if (connection.tokenExpiresAt && connection.tokenExpiresAt < new Date()) {
      await this.updateConnectionStatus(userId, provider, BrokerStatus.EXPIRED);
      
      return {
        provider,
        status: BrokerStatus.EXPIRED,
        lastConnectedAt: connection.lastConnectedAt,
        lastError: 'Session expired',
      };
    }

    return {
      provider,
      status: connection.status as BrokerStatus,
      lastConnectedAt: connection.lastConnectedAt,
      lastError: connection.lastErrorMessage,
      lastErrorCode: connection.lastErrorCode,
    };
  }

  /**
   * Save or update broker connection
   */
  async saveConnection(
    userId: string,
    provider: string,
    sessionToken: string,
    refreshToken: string | undefined,
    expiresAt: Date,
    clientId: string,
    metadata?: any,
  ): Promise<void> {
    this.logger.log(`Saving connection for user ${userId}, provider ${provider}`);

    try {
      // Encrypt tokens
      const encryptedToken = encrypt(sessionToken, this.encryptionKey);
      const encryptedRefresh = refreshToken ? encrypt(refreshToken, this.encryptionKey) : null;
      const encryptedClientId = encrypt(clientId, this.encryptionKey);

      await this.prisma.brokerConnection.upsert({
        where: {
          userId_provider: {
            userId,
            provider,
          },
        },
        create: {
          userId,
          provider,
          status: BrokerStatus.CONNECTED,
          clientId: encryptedClientId,
          encryptedToken,
          encryptedRefresh,
          tokenExpiresAt: expiresAt,
          lastConnectedAt: new Date(),
          metadata,
        },
        update: {
          status: BrokerStatus.CONNECTED,
          clientId: encryptedClientId,
          encryptedToken,
          encryptedRefresh,
          tokenExpiresAt: expiresAt,
          lastConnectedAt: new Date(),
          lastErrorMessage: null,
          lastErrorCode: null,
          metadata,
        },
      });

      this.logger.log('✓ Connection saved successfully');
    } catch (error) {
      const err = error as Error;
      this.logger.error(`Failed to save connection: ${err.message}`, err.stack);
      throw new HttpException(
        {
          error: 'DATABASE_ERROR',
          message: 'Failed to save broker connection',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get decrypted session token for a user
   */
  async getSessionToken(userId: string, provider: string = 'ANGELONE'): Promise<string> {
    const connection = await this.prisma.brokerConnection.findUnique({
      where: {
        userId_provider: {
          userId,
          provider,
        },
      },
    });

    if (!connection || !connection.encryptedToken) {
      throw new NotFoundException({
        error: 'BROKER_NOT_CONNECTED',
        message: 'Broker connection not found',
      });
    }

    // Check expiry
    if (connection.tokenExpiresAt && connection.tokenExpiresAt < new Date()) {
      throw new HttpException(
        {
          error: 'BROKER_SESSION_EXPIRED',
          message: 'Broker session has expired',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    try {
      return decrypt(connection.encryptedToken, this.encryptionKey);
    } catch (error) {
      this.logger.error(`Failed to decrypt session token: ${(error as Error).message}`);
      throw new HttpException(
        {
          error: 'DECRYPTION_ERROR',
          message: 'Failed to retrieve session token',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Update connection status
   */
  async updateConnectionStatus(
    userId: string,
    provider: string,
    status: BrokerStatus,
    errorMessage?: string,
    errorCode?: string,
  ): Promise<void> {
    await this.prisma.brokerConnection.updateMany({
      where: {
        userId,
        provider,
      },
      data: {
        status,
        lastErrorMessage: errorMessage || null,
        lastErrorCode: errorCode || null,
      },
    });
  }

  /**
   * Delete broker connection (disconnect)
   */
  async deleteConnection(userId: string, provider: string = 'ANGELONE'): Promise<void> {
    this.logger.log(`Deleting connection for user ${userId}, provider ${provider}`);

    await this.prisma.brokerConnection.deleteMany({
      where: {
        userId,
        provider,
      },
    });

    this.logger.log('✓ Connection deleted');
  }

  /**
   * Get connection metadata
   */
  async getConnectionMetadata(userId: string, provider: string = 'ANGELONE'): Promise<any> {
    const connection = await this.prisma.brokerConnection.findUnique({
      where: {
        userId_provider: {
          userId,
          provider,
        },
      },
      select: {
        metadata: true,
      },
    });

    return connection?.metadata || null;
  }
}
