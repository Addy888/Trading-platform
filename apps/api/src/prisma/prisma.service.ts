import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Create adapter with connection config object
    // PrismaMariaDb accepts mariadb PoolConfig
    const adapter = new PrismaMariaDb({
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || 'trading_app',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'tradeing_db',
      connectionLimit: 10,
      acquireTimeout: 10000,
      idleTimeout: 60000,
      allowPublicKeyRetrieval: true,
      connectTimeout: 10000,
    });

    // Initialize PrismaClient with adapter
    super({ adapter });
  }

  async onModuleInit() {
    try {
      this.logger.log('Connecting to database...');
      this.logger.log(`DB Config: ${process.env.DB_USER}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
      
      await this.$connect();
      
      // Test database connectivity with a simple query
      await this.$queryRaw`SELECT 1`;
      
      this.logger.log('✓ Database connected successfully');
    } catch (error) {
      this.logger.error('✗ Database connection failed');
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Categorize the error for developers
      if (errorMessage.includes('Access denied') || errorMessage.includes('1045')) {
        this.logger.error('ERROR CATEGORY: MYSQL_AUTH_FAILED');
        this.logger.error('Database authentication failed. Check DB_USER and DB_PASSWORD in .env');
      } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ETIMEDOUT')) {
        this.logger.error('ERROR CATEGORY: MYSQL_UNREACHABLE');
        this.logger.error('Cannot connect to MySQL server. Is it running?');
      } else if (errorMessage.includes('Unknown database')) {
        this.logger.error('ERROR CATEGORY: DATABASE_NOT_FOUND');
        this.logger.error(`Database "${process.env.DB_NAME}" does not exist`);
      } else if (errorMessage.includes('pool timeout') || errorMessage.includes('45028')) {
        this.logger.error('ERROR CATEGORY: CONNECTION_POOL_TIMEOUT');
        this.logger.error('Pool timeout - cannot acquire connection. Check credentials and database access.');
      } else {
        this.logger.error('ERROR CATEGORY: DATABASE_CONNECTION_FAILED');
        this.logger.error(errorMessage);
      }
      
      // Fail fast - don't start the application with broken database
      throw new Error('Database connection failed. Application cannot start.');
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }
}
