import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import {
  AngelOnePositionResponse,
  AngelOneHoldingResponse,
  AngelOneFundsResponse,
  AngelOneErrorResponse,
} from './angelone-types';

/**
 * Angel One Portfolio Adapter
 * 
 * Day 4: Real Broker Positions, Portfolio Sync & Live P&L
 * 
 * Fetches portfolio data from Angel One SmartAPI:
 * - Open positions
 * - Holdings (long-term investments)
 * - Account funds/margin
 * 
 * Official API Documentation:
 * https://smartapi.angelbroking.com/docs/Positions
 * https://smartapi.angelbroking.com/docs/Holdings
 * https://smartapi.angelbroking.com/docs/RMS
 */
@Injectable()
export class AngelOnePortfolioAdapter {
  private readonly logger = new Logger(AngelOnePortfolioAdapter.name);
  private readonly baseUrl = 'https://apiconnect.angelbroking.com';

  /**
   * Get open positions from Angel One
   * 
   * Endpoint: GET /rest/secure/angelbroking/order/v1/getPosition
   * 
   * Returns:
   * - Product (INTRADAY, DELIVERY, CARRYFORWARD, etc.)
   * - Symbol, exchange, token
   * - Buy/sell quantity, average price
   * - Current market price (LTP)
   * - Realized and unrealized P&L
   * - Lot size, multiplier
   * 
   * @param sessionToken - JWT token from login
   * @returns Position response with data array
   */
  async getPositions(sessionToken: string): Promise<AngelOnePositionResponse> {
    this.logger.log('Fetching open positions from Angel One');

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

      const response = await fetch(
        `${this.baseUrl}/rest/secure/angelbroking/order/v1/getPosition`,
        {
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
        },
      );

      const data: AngelOnePositionResponse | AngelOneErrorResponse = await response.json();

      if (!data.status || !('data' in data)) {
        this.logger.error(`Failed to fetch positions: ${data.message}`);
        throw this.mapAngelOneError(data as AngelOneErrorResponse);
      }

      this.logger.log(`✓ Fetched ${data.data.length} positions`);
      return data as AngelOnePositionResponse;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      const err = error as Error;
      this.logger.error(`Position fetch error: ${err.message}`, err.stack);
      throw new HttpException(
        {
          error: 'BROKER_API_ERROR',
          message: 'Failed to fetch positions from broker',
          details: err.message,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Get holdings from Angel One
   * 
   * Endpoint: GET /rest/secure/angelbroking/portfolio/v1/getHolding
   * 
   * Holdings = Long-term investments (delivered stocks)
   * Different from positions (intraday/F&O)
   * 
   * Returns:
   * - Symbol, exchange, ISIN
   * - Quantity, average price
   * - Current market price (LTP)
   * - Profit/loss
   * - Collateral value
   * 
   * @param sessionToken - JWT token from login
   * @returns Holding response with data array
   */
  async getHoldings(sessionToken: string): Promise<AngelOneHoldingResponse> {
    this.logger.log('Fetching holdings from Angel One');

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

      const response = await fetch(
        `${this.baseUrl}/rest/secure/angelbroking/portfolio/v1/getHolding`,
        {
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
        },
      );

      const data: AngelOneHoldingResponse | AngelOneErrorResponse = await response.json();

      if (!data.status || !('data' in data)) {
        this.logger.error(`Failed to fetch holdings: ${data.message}`);
        throw this.mapAngelOneError(data as AngelOneErrorResponse);
      }

      this.logger.log(`✓ Fetched ${data.data.holdings.length} holdings`);
      return data as AngelOneHoldingResponse;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      const err = error as Error;
      this.logger.error(`Holdings fetch error: ${err.message}`, err.stack);
      throw new HttpException(
        {
          error: 'BROKER_API_ERROR',
          message: 'Failed to fetch holdings from broker',
          details: err.message,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Get account funds/margin from Angel One
   * 
   * Endpoint: GET /rest/secure/angelbroking/user/v1/getRMS
   * 
   * RMS = Risk Management System data
   * 
   * Returns:
   * - Available cash
   * - Used margin
   * - Available margin
   * - Collateral value
   * - Net available funds
   * 
   * @param sessionToken - JWT token from login
   * @returns Funds response with RMS data
   */
  async getFunds(sessionToken: string): Promise<AngelOneFundsResponse> {
    this.logger.log('Fetching funds/margin from Angel One');

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

      const response = await fetch(
        `${this.baseUrl}/rest/secure/angelbroking/user/v1/getRMS`,
        {
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
        },
      );

      const data: AngelOneFundsResponse | AngelOneErrorResponse = await response.json();

      if (!data.status || !('data' in data)) {
        this.logger.error(`Failed to fetch funds: ${data.message}`);
        throw this.mapAngelOneError(data as AngelOneErrorResponse);
      }

      this.logger.log('✓ Fetched account funds/margin');
      return data as AngelOneFundsResponse;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      const err = error as Error;
      this.logger.error(`Funds fetch error: ${err.message}`, err.stack);
      throw new HttpException(
        {
          error: 'BROKER_API_ERROR',
          message: 'Failed to fetch funds from broker',
          details: err.message,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Map Angel One error responses to application errors
   * 
   * @param error - Angel One error response
   * @returns HttpException with normalized error
   */
  private mapAngelOneError(error: AngelOneErrorResponse): HttpException {
    const errorCode = error.errorcode || 'UNKNOWN';
    const errorMessage = error.message || 'Unknown error';

    this.logger.error(`Angel One Error [${errorCode}]: ${errorMessage}`);

    // Session expired
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

    // Rate limit
    if (errorCode.startsWith('AB2') || errorMessage.includes('rate limit')) {
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
