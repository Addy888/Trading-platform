import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import {
  AngelOnePlaceOrderRequest,
  AngelOnePlaceOrderResponse,
  AngelOneOrderStatusRequest,
  AngelOneOrderStatusResponse,
  AngelOneOrderBookResponse,
  AngelOneCancelOrderRequest,
  AngelOneCancelOrderResponse,
  AngelOneErrorResponse,
} from './angelone-types';

/**
 * Angel One Order Adapter
 * 
 * Handles order placement, status checking, and cancellation
 * for Angel One SmartAPI
 * 
 * Official Order API: https://smartapi.angelbroking.com/docs/Orders
 */
@Injectable()
export class AngelOneOrderAdapter {
  private readonly logger = new Logger(AngelOneOrderAdapter.name);
  private readonly baseUrl = 'https://apiconnect.angelbroking.com';

  /**
   * Place order with Angel One
   * 
   * @param sessionToken - JWT token from login
   * @param orderRequest - Order parameters
   * @returns Order placement response with order ID
   */
  async placeOrder(
    sessionToken: string,
    orderRequest: AngelOnePlaceOrderRequest,
  ): Promise<AngelOnePlaceOrderResponse> {
    this.logger.log(`Placing order: ${orderRequest.transactiontype} ${orderRequest.quantity} ${orderRequest.tradingsymbol}`);

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

      const response = await fetch(`${this.baseUrl}/rest/secure/angelbroking/order/v1/placeOrder`, {
        method: 'POST',
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
        body: JSON.stringify(orderRequest),
      });

      const data: AngelOnePlaceOrderResponse | AngelOneErrorResponse = await response.json();

      if (!data.status || !('data' in data)) {
        this.logger.error(`Order placement failed: ${data.message}`);
        throw this.mapAngelOneError(data as AngelOneErrorResponse);
      }

      const orderData = data as AngelOnePlaceOrderResponse;
      this.logger.log(`✓ Order placed successfully: ${orderData.data.orderid}`);

      return orderData;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      const err = error as Error;
      this.logger.error(`Order placement error: ${err.message}`, err.stack);
      throw new HttpException(
        {
          error: 'BROKER_ORDER_FAILED',
          message: 'Failed to place order with broker',
          details: err.message,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Get order status from Angel One
   * 
   * @param sessionToken - JWT token
   * @param orderRequest - Order identifier (orderid or uniqueorderid)
   * @returns Order status details
   */
  async getOrderStatus(
    sessionToken: string,
    orderRequest: AngelOneOrderStatusRequest,
  ): Promise<AngelOneOrderStatusResponse> {
    this.logger.log(`Fetching order status: ${orderRequest.orderid || orderRequest.uniqueorderid}`);

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

      const response = await fetch(`${this.baseUrl}/rest/secure/angelbroking/order/v1/getOrderStatus`, {
        method: 'POST',
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
        body: JSON.stringify(orderRequest),
      });

      const data: AngelOneOrderStatusResponse | AngelOneErrorResponse = await response.json();

      if (!data.status || !('data' in data)) {
        this.logger.error(`Order status fetch failed: ${data.message}`);
        throw this.mapAngelOneError(data as AngelOneErrorResponse);
      }

      return data as AngelOneOrderStatusResponse;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      const err = error as Error;
      this.logger.error(`Order status error: ${err.message}`, err.stack);
      throw new HttpException(
        {
          error: 'BROKER_API_ERROR',
          message: 'Failed to fetch order status',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Get all orders (order book) from Angel One
   * 
   * @param sessionToken - JWT token
   * @returns List of all orders
   */
  async getOrderBook(sessionToken: string): Promise<AngelOneOrderBookResponse> {
    this.logger.log('Fetching order book');

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

      const response = await fetch(`${this.baseUrl}/rest/secure/angelbroking/order/v1/getOrderBook`, {
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

      const data: AngelOneOrderBookResponse | AngelOneErrorResponse = await response.json();

      if (!data.status || !('data' in data)) {
        this.logger.error(`Order book fetch failed: ${data.message}`);
        throw this.mapAngelOneError(data as AngelOneErrorResponse);
      }

      return data as AngelOneOrderBookResponse;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      const err = error as Error;
      this.logger.error(`Order book error: ${err.message}`, err.stack);
      throw new HttpException(
        {
          error: 'BROKER_API_ERROR',
          message: 'Failed to fetch order book',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Cancel an order with Angel One
   * 
   * @param sessionToken - JWT token
   * @param cancelRequest - Order cancellation parameters
   * @returns Cancellation response
   */
  async cancelOrder(
    sessionToken: string,
    cancelRequest: AngelOneCancelOrderRequest,
  ): Promise<AngelOneCancelOrderResponse> {
    this.logger.log(`Cancelling order: ${cancelRequest.orderid}`);

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

      const response = await fetch(`${this.baseUrl}/rest/secure/angelbroking/order/v1/cancelOrder`, {
        method: 'POST',
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
        body: JSON.stringify(cancelRequest),
      });

      const data: AngelOneCancelOrderResponse | AngelOneErrorResponse = await response.json();

      if (!data.status || !('data' in data)) {
        this.logger.error(`Order cancellation failed: ${data.message}`);
        throw this.mapAngelOneError(data as AngelOneErrorResponse);
      }

      const cancelData = data as AngelOneCancelOrderResponse;
      this.logger.log(`✓ Order cancelled successfully: ${cancelData.data.orderid}`);

      return cancelData;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      const err = error as Error;
      this.logger.error(`Order cancellation error: ${err.message}`, err.stack);
      throw new HttpException(
        {
          error: 'BROKER_CANCEL_FAILED',
          message: 'Failed to cancel order with broker',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Map Angel One status to normalized status
   */
  mapToNormalizedStatus(angelOneStatus: string): string {
    const statusMap: { [key: string]: string } = {
      'open pending': 'PENDING_SUBMISSION',
      'validation pending': 'PENDING_SUBMISSION',
      'put order req received': 'SUBMITTED',
      'trigger pending': 'OPEN',
      'open': 'OPEN',
      'complete': 'FILLED',
      'cancelled': 'CANCELLED',
      'rejected': 'REJECTED',
      'modified': 'OPEN',
      'cancelled after market order': 'CANCELLED',
    };

    return statusMap[angelOneStatus.toLowerCase()] || 'OPEN';
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
          error: 'BROKER_INVALID_REQUEST',
          message: 'Invalid order parameters',
          details: errorMessage,
          code: errorCode,
        },
        HttpStatus.BAD_REQUEST,
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

    if (errorMessage.includes('RMS') || errorMessage.includes('limit') || errorMessage.includes('margin')) {
      return new HttpException(
        {
          error: 'BROKER_INSUFFICIENT_FUNDS',
          message: 'Insufficient funds or margin',
          details: errorMessage,
          code: errorCode,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

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
        error: 'BROKER_ORDER_ERROR',
        message: 'Broker order error',
        details: errorMessage,
        code: errorCode,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}
