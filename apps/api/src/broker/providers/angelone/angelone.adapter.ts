import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import * as OTPAuth from 'otpauth';
import { BrokerProvider, BrokerCredentials, BrokerSession, BrokerProfile } from '../../interfaces/broker-provider.interface';
import { AccountSummaryDto } from '../../dto/account-summary.dto';
import {
  AngelOneLoginRequest,
  AngelOneLoginResponse,
  AngelOneProfileResponse,
  AngelOneRMSLimitResponse,
  AngelOneErrorResponse,
} from './angelone-types';

/**
 * Angel One SmartAPI Adapter
 * Implements the BrokerProvider interface for Angel One broker
 * 
 * Official Documentation: https://smartapi.angelbroking.com/docs/
 * Base URL: https://apiconnect.angelbroking.com
 */
@Injectable()
export class AngelOneAdapter implements BrokerProvider {
  private readonly logger = new Logger(AngelOneAdapter.name);
  private readonly baseUrl = 'https://apiconnect.angelbroking.com';

  /**
   * Authenticate with Angel One SmartAPI
   * Requires: client ID, password, API key, and TOTP secret
   */
  async connect(credentials: BrokerCredentials): Promise<BrokerSession> {
    this.logger.log('Attempting to connect to Angel One...');

    try {
      // Generate TOTP for 2FA
      const totp = this.generateTOTP(credentials.totpSecret);

      // Prepare login request
      const loginPayload: AngelOneLoginRequest = {
        clientcode: credentials.clientId,
        password: credentials.password,
        totp,
      };

      // Make API call
      const response = await fetch(`${this.baseUrl}/rest/auth/angelbroking/user/v1/loginByPassword`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-UserType': 'USER',
          'X-SourceID': 'WEB',
          'X-ClientLocalIP': '127.0.0.1',
          'X-ClientPublicIP': '127.0.0.1',
          'X-MACAddress': '00:00:00:00:00:00',
          'X-PrivateKey': credentials.apiKey,
        },
        body: JSON.stringify(loginPayload),
      });

      const data: AngelOneLoginResponse | AngelOneErrorResponse = await response.json();

      if (!data.status || !('data' in data)) {
        this.logger.error(`Angel One authentication failed: ${data.message}`);
        throw this.mapAngelOneError(data as AngelOneErrorResponse);
      }

      const loginData = data as AngelOneLoginResponse;

      this.logger.log('✓ Angel One authentication successful');

      // Calculate token expiry (Angel One tokens are valid for 24 hours)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      return {
        accessToken: loginData.data.jwtToken,
        refreshToken: loginData.data.refreshToken,
        expiresAt,
        metadata: {
          feedToken: loginData.data.feedToken,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      const err = error as Error;
      this.logger.error(`Angel One connection error: ${err.message}`, err.stack);
      throw new HttpException(
        {
          error: 'BROKER_CONNECTION_FAILED',
          message: 'Failed to connect to broker',
          details: 'Network error or broker unavailable',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Check if session token is still valid
   * Angel One tokens are valid for 24 hours
   */
  async isSessionValid(sessionToken: string): Promise<boolean> {
    try {
      // Try to fetch profile to validate token
      await this.getProfile(sessionToken);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get broker profile information
   */
  async getProfile(sessionToken: string): Promise<BrokerProfile> {
    this.logger.log('Fetching Angel One profile...');

    try {
      const apiKey = process.env.ANGELONE_API_KEY;
      if (!apiKey) {
        throw new HttpException(
          {
            error: 'BROKER_CONFIG_ERROR',
            message: 'Broker API key not configured',
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      const response = await fetch(`${this.baseUrl}/rest/secure/angelbroking/user/v1/getProfile`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-UserType': 'USER',
          'X-SourceID': 'WEB',
          'X-ClientLocalIP': '127.0.0.1',
          'X-ClientPublicIP': '127.0.0.1',
          'X-MACAddress': '00:00:00:00:00:00',
          'X-PrivateKey': apiKey,
        },
      });

      const data: AngelOneProfileResponse | AngelOneErrorResponse = await response.json();

      if (!data.status || !('data' in data)) {
        this.logger.error(`Failed to fetch profile: ${data.message}`);
        throw this.mapAngelOneError(data as AngelOneErrorResponse);
      }

      const profileData = data as AngelOneProfileResponse;

      return {
        clientId: profileData.data.clientcode,
        name: profileData.data.name,
        email: profileData.data.email,
        exchanges: profileData.data.exchanges,
        metadata: {
          mobileno: profileData.data.mobileno,
          products: profileData.data.products,
          lastlogintime: profileData.data.lastlogintime,
          broker: profileData.data.broker,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      const err = error as Error;
      this.logger.error(`Profile fetch error: ${err.message}`, err.stack);
      throw new HttpException(
        {
          error: 'BROKER_API_ERROR',
          message: 'Failed to fetch profile',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Get account summary (funds, margin, etc.)
   */
  async getAccountSummary(sessionToken: string): Promise<AccountSummaryDto> {
    this.logger.log('Fetching Angel One account summary...');

    try {
      const apiKey = process.env.ANGELONE_API_KEY;
      if (!apiKey) {
        throw new HttpException(
          {
            error: 'BROKER_CONFIG_ERROR',
            message: 'Broker API key not configured',
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // Fetch profile for basic info
      const profile = await this.getProfile(sessionToken);

      // Fetch RMS limits (funds/margin data)
      const response = await fetch(`${this.baseUrl}/rest/secure/angelbroking/user/v1/getRMS`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-UserType': 'USER',
          'X-SourceID': 'WEB',
          'X-ClientLocalIP': '127.0.0.1',
          'X-ClientPublicIP': '127.0.0.1',
          'X-MACAddress': '00:00:00:00:00:00',
          'X-PrivateKey': apiKey,
        },
      });

      const data: AngelOneRMSLimitResponse | AngelOneErrorResponse = await response.json();

      if (!data.status || !('data' in data)) {
        this.logger.warn(`Failed to fetch RMS data: ${data.message}`);
        // Return profile data only if RMS fails
        return {
          provider: 'ANGELONE',
          clientId: profile.clientId,
          name: profile.name,
          email: profile.email,
          exchanges: profile.exchanges,
        };
      }

      const rmsData = data as AngelOneRMSLimitResponse;

      // Parse numeric values
      const availableCash = parseFloat(rmsData.data.availablecash || '0');
      const utilisedMargin = parseFloat(rmsData.data.utilisedspan || '0') +
                            parseFloat(rmsData.data.utilisedexposure || '0');
      const netFunds = parseFloat(rmsData.data.net || '0');

      return {
        provider: 'ANGELONE',
        clientId: profile.clientId,
        name: profile.name,
        email: profile.email,
        availableFunds: availableCash,
        usedMargin: utilisedMargin,
        totalFunds: netFunds,
        exchanges: profile.exchanges,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      const err = error as Error;
      this.logger.error(`Account summary error: ${err.message}`, err.stack);
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
   * Disconnect from Angel One (logout)
   * Note: Angel One doesn't have an explicit logout endpoint in current API
   * Token will expire after 24 hours
   */
  async disconnect(sessionToken: string): Promise<void> {
    this.logger.log('Disconnecting from Angel One...');
    // Angel One API doesn't have explicit logout
    // Token invalidation happens on expiry (24 hours)
    this.logger.log('✓ Session marked for disconnection (token will expire in 24h)');
  }

  /**
   * Generate TOTP for 2FA authentication
   */
  private generateTOTP(totpSecret: string): string {
    if (!totpSecret) {
      throw new HttpException(
        {
          error: 'BROKER_CONFIG_ERROR',
          message: 'TOTP secret not configured',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const totp = new OTPAuth.TOTP({
        secret: totpSecret,
        digits: 6,
        period: 30,
      });

      return totp.generate();
    } catch (error) {
      this.logger.error(`TOTP generation failed: ${(error as Error).message}`);
      throw new HttpException(
        {
          error: 'BROKER_AUTH_ERROR',
          message: 'Failed to generate TOTP',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Map Angel One error responses to application errors
   */
  private mapAngelOneError(error: AngelOneErrorResponse): HttpException {
    const errorCode = error.errorcode || 'UNKNOWN';
    const errorMessage = error.message || 'Unknown error';

    this.logger.error(`Angel One Error [${errorCode}]: ${errorMessage}`);

    // Map common error codes
    if (errorCode === 'AB1004' || errorCode.includes('Invalid')) {
      return new HttpException(
        {
          error: 'BROKER_AUTH_FAILED',
          message: 'Authentication failed',
          details: 'Invalid credentials or TOTP',
          code: errorCode,
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (errorCode === 'AB1008' || errorMessage.includes('session')) {
      return new HttpException(
        {
          error: 'BROKER_SESSION_EXPIRED',
          message: 'Session expired',
          details: 'Please reconnect to the broker',
          code: errorCode,
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (errorCode.startsWith('AB2') || errorMessage.includes('limit')) {
      return new HttpException(
        {
          error: 'BROKER_RATE_LIMIT',
          message: 'Rate limit exceeded',
          details: 'Too many requests to broker API',
          code: errorCode,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Generic error
    return new HttpException(
      {
        error: 'BROKER_API_ERROR',
        message: 'Broker API error',
        details: errorMessage,
        code: errorCode,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
