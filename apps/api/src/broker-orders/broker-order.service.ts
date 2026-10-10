import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerConnectionService } from '../broker/broker-connection.service';
import { AngelOneOrderAdapter } from '../broker/providers/angelone/angelone-order.adapter';
import { PaperOrderAdapter } from './adapters/paper-order.adapter';
import { PreTradeRiskValidationService } from '../trading-engine/pre-trade-risk-validation.service';
import { PlaceOrderDto, TradingMode, OrderType } from './dto/place-order.dto';
import { OrderResponseDto, BrokerOrderStatus, CancelOrderResponseDto } from './dto/order-response.dto';
import { TradeSide } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import Decimal from 'decimal.js';

/**
 * Broker Order Service
 * 
 * Day 3: Real Broker Order Execution
 * 
 * Responsibilities:
 * - Orchestrate order placement with pre-trade validation
 * - Handle both SIMULATED and LIVE trading modes
 * - Enforce idempotency protection
 * - Manage order status reconciliation
 * - Provide order history and tracking
 * 
 * Security:
 * - All orders pass through pre-trade risk validation
 * - User ownership verified for all operations
 * - LIVE orders require explicit confirmation
 * - No silent fallback from LIVE to SIMULATED
 */
@Injectable()
export class BrokerOrderService {
  private readonly logger = new Logger(BrokerOrderService.name);

  constructor(
    private prisma: PrismaService,
    private brokerConnection: BrokerConnectionService,
    private angelOneOrder: AngelOneOrderAdapter,
    private paperOrder: PaperOrderAdapter,
    private riskValidation: PreTradeRiskValidationService,
  ) {}

  /**
   * Place a new order (SIMULATED or LIVE)
   * 
   * @param userId - Authenticated user ID
   * @param placeOrderDto - Order parameters
   * @returns Order response with status
   */
  async placeOrder(userId: string, placeOrderDto: PlaceOrderDto): Promise<OrderResponseDto> {
    const startTime = Date.now();
    this.logger.log(
      `Placing ${placeOrderDto.tradingMode} order: ${placeOrderDto.side} ${placeOrderDto.quantity} ${placeOrderDto.symbol}`
    );

    // Generate idempotency key if not provided
    const idempotencyKey = placeOrderDto.idempotencyKey || uuidv4();

    try {
      // Check for duplicate order (idempotency)
      const existingOrder = await this.prisma.brokerOrder.findUnique({
        where: { idempotencyKey },
      });

      if (existingOrder) {
        this.logger.warn(`Duplicate order detected (idempotency key: ${idempotencyKey})`);
        return this.mapToResponse(existingOrder);
      }

      // Verify trading account ownership
      const tradingAccount = await this.prisma.tradingAccount.findUnique({
        where: { id: placeOrderDto.tradingAccountId },
        include: { ruleSnapshot: true },
      });

      if (!tradingAccount) {
        throw new HttpException(
          {
            error: 'ACCOUNT_NOT_FOUND',
            message: 'Trading account not found',
          },
          HttpStatus.NOT_FOUND,
        );
      }

      if (tradingAccount.userId !== userId) {
        throw new HttpException(
          {
            error: 'ACCOUNT_NOT_OWNED',
            message: 'You do not own this trading account',
          },
          HttpStatus.FORBIDDEN,
        );
      }

      // Mode-specific validation
      if (placeOrderDto.tradingMode === TradingMode.LIVE) {
        await this.validateLiveMode(userId, placeOrderDto);
      } else if (placeOrderDto.tradingMode === TradingMode.BROKER_SANDBOX) {
        // Angel One has NO official sandbox
        throw new HttpException(
          {
            error: 'BROKER_SANDBOX_NOT_AVAILABLE',
            message: 'Angel One does not provide an official sandbox environment. Use PAPER mode instead.',
          },
          HttpStatus.NOT_IMPLEMENTED,
        );
      } else if (placeOrderDto.tradingMode === TradingMode.PAPER) {
        this.logger.log('Paper trading mode - will use local simulation with real market data');
      }

      // Pre-trade risk validation
      const validationResult = await this.riskValidation.validateOrder(
        {
          tradingAccountId: placeOrderDto.tradingAccountId,
          symbol: placeOrderDto.symbol,
          side: placeOrderDto.side,
          volume: new Decimal(placeOrderDto.quantity),
          orderType: placeOrderDto.orderType,
          stopLoss: placeOrderDto.stopLoss ? new Decimal(placeOrderDto.stopLoss) : undefined,
          takeProfit: placeOrderDto.takeProfit ? new Decimal(placeOrderDto.takeProfit) : undefined,
        },
        { userId, role: 'USER' },
      );

      if (!validationResult.approved) {
        this.logger.warn(
          `Order rejected by risk validation: ${validationResult.code} - ${validationResult.message}`
        );

        // Create rejected order record
        const rejectedOrder = await this.prisma.brokerOrder.create({
          data: {
            userId,
            tradingAccountId: placeOrderDto.tradingAccountId,
            brokerConnectionId: await this.getBrokerConnectionId(userId, placeOrderDto.tradingMode),
            tradingMode: placeOrderDto.tradingMode,
            symbol: placeOrderDto.symbol,
            side: placeOrderDto.side,
            orderType: placeOrderDto.orderType,
            quantity: new Decimal(placeOrderDto.quantity),
            price: placeOrderDto.price ? new Decimal(placeOrderDto.price) : null,
            triggerPrice: placeOrderDto.triggerPrice ? new Decimal(placeOrderDto.triggerPrice) : null,
            stopLoss: placeOrderDto.stopLoss ? new Decimal(placeOrderDto.stopLoss) : null,
            takeProfit: placeOrderDto.takeProfit ? new Decimal(placeOrderDto.takeProfit) : null,
            status: BrokerOrderStatus.REJECTED,
            riskValidationCode: validationResult.code,
            riskValidationMessage: validationResult.message,
            riskValidationMetadata: validationResult.metadata as any,
            rejectedAt: new Date(),
            rejectionReason: validationResult.message,
            rejectionCode: validationResult.code,
            idempotencyKey,
          },
        });

        return this.mapToResponse(rejectedOrder);
      }

      // Order approved by risk engine
      this.logger.log(`✓ Order approved by risk validation (${Date.now() - startTime}ms)`);

      // Route to appropriate execution
      if (placeOrderDto.tradingMode === TradingMode.SIMULATED) {
        return await this.executeSimulatedOrder(userId, placeOrderDto, idempotencyKey, validationResult);
      } else if (placeOrderDto.tradingMode === TradingMode.PAPER) {
        return await this.executePaperOrder(userId, placeOrderDto, idempotencyKey, validationResult);
      } else if (placeOrderDto.tradingMode === TradingMode.LIVE) {
        return await this.executeLiveOrder(userId, placeOrderDto, idempotencyKey, validationResult);
      } else {
        throw new HttpException(
          {
            error: 'INVALID_TRADING_MODE',
            message: `Trading mode ${placeOrderDto.tradingMode} is not supported`,
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    } catch (error) {
      this.logger.error(`Order placement failed: ${(error as Error).message}`, (error as Error).stack);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          error: 'ORDER_PLACEMENT_FAILED',
          message: 'Failed to place order',
          details: (error as Error).message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Execute PAPER order with local paper adapter
   */
  private async executePaperOrder(
    userId: string,
    placeOrderDto: PlaceOrderDto,
    idempotencyKey: string,
    validationResult: any,
  ): Promise<OrderResponseDto> {
    this.logger.log('[PAPER] Executing paper order with local adapter');

    const brokerConnectionId = await this.getBrokerConnectionId(userId, TradingMode.PAPER);

    // Create order record in PENDING_SUBMISSION state
    const order = await this.prisma.brokerOrder.create({
      data: {
        userId,
        tradingAccountId: placeOrderDto.tradingAccountId,
        brokerConnectionId,
        tradingMode: TradingMode.PAPER,
        symbol: placeOrderDto.symbol,
        side: placeOrderDto.side,
        orderType: placeOrderDto.orderType,
        quantity: new Decimal(placeOrderDto.quantity),
        price: placeOrderDto.price ? new Decimal(placeOrderDto.price) : null,
        triggerPrice: placeOrderDto.triggerPrice ? new Decimal(placeOrderDto.triggerPrice) : null,
        stopLoss: placeOrderDto.stopLoss ? new Decimal(placeOrderDto.stopLoss) : null,
        takeProfit: placeOrderDto.takeProfit ? new Decimal(placeOrderDto.takeProfit) : null,
        status: BrokerOrderStatus.PENDING_SUBMISSION,
        riskValidationCode: validationResult.code,
        riskValidationMessage: validationResult.message,
        riskValidationMetadata: validationResult.metadata as any,
        idempotencyKey,
      },
    });

    // Execute asynchronously via paper adapter (non-blocking)
    this.paperOrder.executePaperOrder(order.id).catch((error) => {
      this.logger.error(`[PAPER] Async execution failed for ${order.id}: ${error.message}`);
    });

    this.logger.log(`[PAPER] Order ${order.id} created and submitted to paper adapter`);

    return this.mapToResponse(order);
  }

  /**
   * Execute SIMULATED order (instant fill)
   */
  private async executeSimulatedOrder(
    userId: string,
    placeOrderDto: PlaceOrderDto,
    idempotencyKey: string,
    validationResult: any,
  ): Promise<OrderResponseDto> {
    this.logger.log('Executing SIMULATED order (instant fill)');

    const brokerConnectionId = await this.getBrokerConnectionId(userId, TradingMode.SIMULATED);

    // Get current market price from validation metadata
    const executionPrice = validationResult.metadata?.executionPrice
      ? new Decimal(validationResult.metadata.executionPrice)
      : placeOrderDto.price
      ? new Decimal(placeOrderDto.price)
      : new Decimal(0);

    const quantity = new Decimal(placeOrderDto.quantity);
    const totalValue = executionPrice.times(quantity);

    // Create instantly filled simulated order
    const order = await this.prisma.brokerOrder.create({
      data: {
        userId,
        tradingAccountId: placeOrderDto.tradingAccountId,
        brokerConnectionId,
        tradingMode: TradingMode.SIMULATED,
        symbol: placeOrderDto.symbol,
        side: placeOrderDto.side,
        orderType: placeOrderDto.orderType,
        quantity,
        price: placeOrderDto.price ? new Decimal(placeOrderDto.price) : null,
        triggerPrice: placeOrderDto.triggerPrice ? new Decimal(placeOrderDto.triggerPrice) : null,
        stopLoss: placeOrderDto.stopLoss ? new Decimal(placeOrderDto.stopLoss) : null,
        takeProfit: placeOrderDto.takeProfit ? new Decimal(placeOrderDto.takeProfit) : null,
        status: BrokerOrderStatus.FILLED,
        statusMessage: 'Simulated order filled instantly',
        filledQuantity: quantity,
        averageFillPrice: executionPrice,
        totalFillValue: totalValue,
        commission: new Decimal(0),
        riskValidationCode: validationResult.code,
        riskValidationMessage: validationResult.message,
        riskValidationMetadata: validationResult.metadata as any,
        submittedAt: new Date(),
        filledAt: new Date(),
        idempotencyKey,
      },
    });

    // Create status history entry
    await this.prisma.brokerOrderStatusHistory.create({
      data: {
        brokerOrderId: order.id,
        previousStatus: null,
        newStatus: BrokerOrderStatus.FILLED,
        statusMessage: 'Simulated order filled instantly',
        changedAt: new Date(),
      },
    });

    this.logger.log(`✓ SIMULATED order filled: ${order.id}`);

    return this.mapToResponse(order);
  }

  /**
   * Execute LIVE order with real broker
   */
  private async executeLiveOrder(
    userId: string,
    placeOrderDto: PlaceOrderDto,
    idempotencyKey: string,
    validationResult: any,
  ): Promise<OrderResponseDto> {
    this.logger.log('Executing LIVE order with broker');

    // Get broker connection
    const connection = await this.prisma.brokerConnection.findFirst({
      where: {
        userId,
        provider: 'ANGELONE',
        status: 'CONNECTED',
      },
    });

    if (!connection) {
      throw new HttpException(
        {
          error: 'BROKER_NOT_CONNECTED',
          message: 'Broker connection not found or expired',
        },
        HttpStatus.PRECONDITION_FAILED,
      );
    }

    // Get session token
    const sessionToken = await this.brokerConnection.getSessionToken(userId, 'ANGELONE');

    // Create order record in PENDING_SUBMISSION state
    const order = await this.prisma.brokerOrder.create({
      data: {
        userId,
        tradingAccountId: placeOrderDto.tradingAccountId,
        brokerConnectionId: connection.id,
        tradingMode: TradingMode.LIVE,
        symbol: placeOrderDto.symbol,
        side: placeOrderDto.side,
        orderType: placeOrderDto.orderType,
        quantity: new Decimal(placeOrderDto.quantity),
        price: placeOrderDto.price ? new Decimal(placeOrderDto.price) : null,
        triggerPrice: placeOrderDto.triggerPrice ? new Decimal(placeOrderDto.triggerPrice) : null,
        stopLoss: placeOrderDto.stopLoss ? new Decimal(placeOrderDto.stopLoss) : null,
        takeProfit: placeOrderDto.takeProfit ? new Decimal(placeOrderDto.takeProfit) : null,
        status: BrokerOrderStatus.PENDING_SUBMISSION,
        riskValidationCode: validationResult.code,
        riskValidationMessage: validationResult.message,
        riskValidationMetadata: validationResult.metadata as any,
        idempotencyKey,
      },
    });

    try {
      // Map to Angel One order format
      const angelOneRequest = this.mapToAngelOneOrder(placeOrderDto, order.id);

      // Submit to broker
      const brokerResponse = await this.angelOneOrder.placeOrder(sessionToken, angelOneRequest);

      // Update order with broker details
      const updatedOrder = await this.prisma.brokerOrder.update({
        where: { id: order.id },
        data: {
          brokerOrderId: brokerResponse.data.orderid,
          status: BrokerOrderStatus.SUBMITTED,
          statusMessage: brokerResponse.message,
          submittedAt: new Date(),
        },
      });

      // Create status history
      await this.prisma.brokerOrderStatusHistory.create({
        data: {
          brokerOrderId: order.id,
          previousStatus: BrokerOrderStatus.PENDING_SUBMISSION,
          newStatus: BrokerOrderStatus.SUBMITTED,
          statusMessage: brokerResponse.message,
          brokerResponse: brokerResponse as any,
          changedAt: new Date(),
        },
      });

      this.logger.log(`✓ LIVE order submitted to broker: ${brokerResponse.data.orderid}`);

      return this.mapToResponse(updatedOrder);
    } catch (error) {
      this.logger.error(`Broker submission failed: ${(error as Error).message}`);

      // Determine if we should mark for reconciliation (timeout) or failed
      const needsReconciliation = this.isTimeoutError(error as Error);

      // Update order status
      const updatedOrder = await this.prisma.brokerOrder.update({
        where: { id: order.id },
        data: {
          status: needsReconciliation ? BrokerOrderStatus.PENDING_RECONCILIATION : BrokerOrderStatus.FAILED,
          statusMessage: (error as Error).message,
          needsReconciliation,
          rejectionReason: needsReconciliation ? 'Timeout - pending reconciliation' : (error as Error).message,
        },
      });

      // Create status history
      await this.prisma.brokerOrderStatusHistory.create({
        data: {
          brokerOrderId: order.id,
          previousStatus: BrokerOrderStatus.PENDING_SUBMISSION,
          newStatus: updatedOrder.status,
          statusMessage: (error as Error).message,
          changedAt: new Date(),
        },
      });

      if (needsReconciliation) {
        this.logger.warn(`Order marked for reconciliation: ${order.id}`);
      }

      return this.mapToResponse(updatedOrder);
    }
  }

  /**
   * Get order by ID
   */
  async getOrder(userId: string, orderId: string): Promise<OrderResponseDto> {
    const order = await this.prisma.brokerOrder.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new HttpException(
        {
          error: 'ORDER_NOT_FOUND',
          message: 'Order not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (order.userId !== userId) {
      throw new HttpException(
        {
          error: 'ORDER_NOT_OWNED',
          message: 'You do not own this order',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    return this.mapToResponse(order);
  }

  /**
   * List user's orders
   */
  async listOrders(
    userId: string,
    tradingAccountId?: string,
    page: number = 1,
    pageSize: number = 50,
  ) {
    const skip = (page - 1) * pageSize;

    const where: any = { userId };
    if (tradingAccountId) {
      where.tradingAccountId = tradingAccountId;
    }

    const [orders, total] = await Promise.all([
      this.prisma.brokerOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip,
      }),
      this.prisma.brokerOrder.count({ where }),
    ]);

    return {
      orders: orders.map((order) => this.mapToResponse(order)),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Cancel an order
   */
  async cancelOrder(userId: string, orderId: string): Promise<CancelOrderResponseDto> {
    this.logger.log(`Cancelling order: ${orderId}`);

    const order = await this.prisma.brokerOrder.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new HttpException(
        {
          error: 'ORDER_NOT_FOUND',
          message: 'Order not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (order.userId !== userId) {
      throw new HttpException(
        {
          error: 'ORDER_NOT_OWNED',
          message: 'You do not own this order',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // Check if order can be cancelled
    const cancellableStatuses = [
      BrokerOrderStatus.PENDING_SUBMISSION,
      BrokerOrderStatus.SUBMITTED,
      BrokerOrderStatus.OPEN,
      BrokerOrderStatus.PARTIALLY_FILLED,
    ];

    if (!cancellableStatuses.includes(order.status as BrokerOrderStatus)) {
      throw new HttpException(
        {
          error: 'ORDER_NOT_CANCELLABLE',
          message: `Order in status ${order.status} cannot be cancelled`,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // SIMULATED orders cancel instantly
    if (order.tradingMode === TradingMode.SIMULATED) {
      const updatedOrder = await this.prisma.brokerOrder.update({
        where: { id: orderId },
        data: {
          status: BrokerOrderStatus.CANCELLED,
          statusMessage: 'Simulated order cancelled',
          cancelledAt: new Date(),
        },
      });

      await this.prisma.brokerOrderStatusHistory.create({
        data: {
          brokerOrderId: orderId,
          previousStatus: order.status,
          newStatus: BrokerOrderStatus.CANCELLED,
          statusMessage: 'Simulated order cancelled',
          changedAt: new Date(),
        },
      });

      return {
        id: updatedOrder.id,
        status: BrokerOrderStatus.CANCELLED,
        statusMessage: 'Simulated order cancelled',
        cancelledAt: updatedOrder.cancelledAt!,
      };
    }

    // PAPER orders cancel via paper adapter
    if (order.tradingMode === TradingMode.PAPER) {
      await this.paperOrder.cancelPaperOrder(orderId);

      const updatedOrder = await this.prisma.brokerOrder.findUnique({
        where: { id: orderId },
      });

      return {
        id: updatedOrder!.id,
        status: updatedOrder!.status as BrokerOrderStatus,
        statusMessage: updatedOrder!.statusMessage || 'Paper order cancelled',
        cancelledAt: updatedOrder!.cancelledAt!,
      };
    }

    // LIVE order cancellation with broker
    if (!order.brokerOrderId) {
      throw new HttpException(
        {
          error: 'BROKER_ORDER_ID_MISSING',
          message: 'Cannot cancel order without broker order ID',
        },
        HttpStatus.PRECONDITION_FAILED,
      );
    }

    try {
      const sessionToken = await this.brokerConnection.getSessionToken(userId, 'ANGELONE');

      const cancelResponse = await this.angelOneOrder.cancelOrder(sessionToken, {
        variety: 'NORMAL',
        orderid: order.brokerOrderId,
      });

      const updatedOrder = await this.prisma.brokerOrder.update({
        where: { id: orderId },
        data: {
          status: BrokerOrderStatus.CANCELLED,
          statusMessage: cancelResponse.message,
          brokerMessage: cancelResponse.message,
          cancelledAt: new Date(),
        },
      });

      await this.prisma.brokerOrderStatusHistory.create({
        data: {
          brokerOrderId: orderId,
          previousStatus: order.status,
          newStatus: BrokerOrderStatus.CANCELLED,
          statusMessage: cancelResponse.message,
          brokerResponse: cancelResponse as any,
          changedAt: new Date(),
        },
      });

      this.logger.log(`✓ Order cancelled: ${orderId}`);

      return {
        id: updatedOrder.id,
        status: BrokerOrderStatus.CANCELLED,
        statusMessage: cancelResponse.message,
        cancelledAt: updatedOrder.cancelledAt!,
        brokerResponse: cancelResponse,
      };
    } catch (error) {
      this.logger.error(`Order cancellation failed: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Reconcile order status with broker
   */
  async reconcileOrder(userId: string, orderId: string): Promise<OrderResponseDto> {
    this.logger.log(`Reconciling order: ${orderId}`);

    const order = await this.prisma.brokerOrder.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new HttpException(
        {
          error: 'ORDER_NOT_FOUND',
          message: 'Order not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    if (order.userId !== userId) {
      throw new HttpException(
        {
          error: 'ORDER_NOT_OWNED',
          message: 'You do not own this order',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    if (order.tradingMode === TradingMode.SIMULATED || order.tradingMode === TradingMode.PAPER) {
      // No reconciliation needed for simulated/paper orders
      return this.mapToResponse(order);
    }

    if (!order.brokerOrderId) {
      // No broker order ID means it never reached the broker
      const updatedOrder = await this.prisma.brokerOrder.update({
        where: { id: orderId },
        data: {
          status: BrokerOrderStatus.FAILED,
          statusMessage: 'Order never reached broker',
          needsReconciliation: false,
        },
      });

      return this.mapToResponse(updatedOrder);
    }

    try {
      const sessionToken = await this.brokerConnection.getSessionToken(userId, 'ANGELONE');

      const statusResponse = await this.angelOneOrder.getOrderStatus(sessionToken, {
        orderid: order.brokerOrderId,
      });

      const brokerStatus = statusResponse.data;
      const normalizedStatus = this.angelOneOrder.mapToNormalizedStatus(brokerStatus.status);

      // Update order with broker status
      const updatedOrder = await this.prisma.brokerOrder.update({
        where: { id: orderId },
        data: {
          status: normalizedStatus as BrokerOrderStatus,
          brokerStatus: brokerStatus.status,
          statusMessage: brokerStatus.text || brokerStatus.orderstatusinfo,
          filledQuantity: new Decimal(brokerStatus.filledshares || 0),
          averageFillPrice: brokerStatus.averageprice ? new Decimal(brokerStatus.averageprice) : null,
          needsReconciliation: false,
          lastReconciliationAt: new Date(),
          reconciliationAttempts: order.reconciliationAttempts + 1,
        },
      });

      await this.prisma.brokerOrderStatusHistory.create({
        data: {
          brokerOrderId: orderId,
          previousStatus: order.status,
          newStatus: normalizedStatus,
          statusMessage: 'Reconciled with broker',
          brokerResponse: brokerStatus as any,
          changedAt: new Date(),
        },
      });

      this.logger.log(`✓ Order reconciled: ${orderId} -> ${normalizedStatus}`);

      return this.mapToResponse(updatedOrder);
    } catch (error) {
      this.logger.error(`Reconciliation failed: ${(error as Error).message}`);

      // Increment reconciliation attempts
      await this.prisma.brokerOrder.update({
        where: { id: orderId },
        data: {
          reconciliationAttempts: order.reconciliationAttempts + 1,
          lastReconciliationAt: new Date(),
        },
      });

      throw error;
    }
  }

  /**
   * Validate LIVE mode requirements
   */
  private async validateLiveMode(userId: string, placeOrderDto: PlaceOrderDto): Promise<void> {
    // Require explicit confirmation
    if (!placeOrderDto.confirmLiveOrder) {
      throw new HttpException(
        {
          error: 'LIVE_ORDER_NOT_CONFIRMED',
          message: 'LIVE order requires explicit confirmation',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Check broker connection
    const connection = await this.prisma.brokerConnection.findFirst({
      where: {
        userId,
        provider: 'ANGELONE',
        status: 'CONNECTED',
      },
    });

    if (!connection) {
      throw new HttpException(
        {
          error: 'BROKER_NOT_CONNECTED',
          message: 'Broker connection required for LIVE trading',
        },
        HttpStatus.PRECONDITION_FAILED,
      );
    }

    // Check token expiry
    if (connection.tokenExpiresAt && connection.tokenExpiresAt < new Date()) {
      throw new HttpException(
        {
          error: 'BROKER_SESSION_EXPIRED',
          message: 'Broker session expired, please reconnect',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Note: Instrument validation would go here once instrument master service is available
    // For now, we'll let the broker reject invalid instruments
  }

  /**
   * Get broker connection ID (or create placeholder for simulated/paper)
   */
  private async getBrokerConnectionId(userId: string, tradingMode: TradingMode): Promise<string> {
    if (tradingMode === TradingMode.LIVE) {
      const connection = await this.prisma.brokerConnection.findFirst({
        where: {
          userId,
          provider: 'ANGELONE',
        },
      });

      if (!connection) {
        throw new HttpException(
          {
            error: 'BROKER_CONNECTION_REQUIRED',
            message: 'Broker connection required',
          },
          HttpStatus.PRECONDITION_FAILED,
        );
      }

      return connection.id;
    }

    // For simulated/paper, create or get a placeholder connection
    const provider = tradingMode === TradingMode.PAPER ? 'PAPER' : 'SIMULATED';
    
    const placeholderConnection = await this.prisma.brokerConnection.findFirst({
      where: {
        userId,
        provider,
      },
    });

    if (placeholderConnection) {
      return placeholderConnection.id;
    }

    // Create placeholder
    const newConnection = await this.prisma.brokerConnection.create({
      data: {
        userId,
        provider,
        status: 'CONNECTED',
      },
    });

    return newConnection.id;
  }

  /**
   * Map to Angel One order format
   */
  private mapToAngelOneOrder(placeOrderDto: PlaceOrderDto, orderId: string): any {
    // Note: This is a simplified mapping
    // In production, you need instrument master to get symboltoken
    
    return {
      variety: 'NORMAL',
      tradingsymbol: placeOrderDto.symbol,
      symboltoken: '0', // TODO: Get from instrument master
      transactiontype: placeOrderDto.side,
      exchange: 'NSE', // TODO: Determine from instrument
      ordertype: this.mapOrderType(placeOrderDto.orderType),
      producttype: 'INTRADAY',
      duration: 'DAY',
      price: placeOrderDto.price?.toString() || '0',
      quantity: placeOrderDto.quantity.toString(),
      triggerprice: placeOrderDto.triggerPrice?.toString(),
    };
  }

  /**
   * Map order type to Angel One format
   */
  private mapOrderType(orderType: string): string {
    const typeMap: { [key: string]: string } = {
      [OrderType.MARKET]: 'MARKET',
      [OrderType.LIMIT]: 'LIMIT',
      [OrderType.STOP_MARKET]: 'STOPLOSS_MARKET',
      [OrderType.STOP_LIMIT]: 'STOPLOSS_LIMIT',
    };

    return typeMap[orderType] || 'MARKET';
  }

  /**
   * Check if error is a timeout
   */
  private isTimeoutError(error: Error): boolean {
    const timeoutIndicators = ['timeout', 'ETIMEDOUT', 'ECONNREFUSED', 'network'];
    const errorMessage = error.message.toLowerCase();
    return timeoutIndicators.some((indicator) => errorMessage.includes(indicator.toLowerCase()));
  }

  /**
   * Map database order to response DTO
   */
  private mapToResponse(order: any): OrderResponseDto {
    return {
      id: order.id,
      tradingAccountId: order.tradingAccountId,
      symbol: order.symbol,
      side: order.side,
      orderType: order.orderType,
      quantity: parseFloat(order.quantity.toString()),
      price: order.price ? parseFloat(order.price.toString()) : undefined,
      triggerPrice: order.triggerPrice ? parseFloat(order.triggerPrice.toString()) : undefined,
      stopLoss: order.stopLoss ? parseFloat(order.stopLoss.toString()) : undefined,
      takeProfit: order.takeProfit ? parseFloat(order.takeProfit.toString()) : undefined,
      tradingMode: order.tradingMode as TradingMode,
      status: order.status as BrokerOrderStatus,
      statusMessage: order.statusMessage,
      brokerOrderId: order.brokerOrderId,
      brokerStatus: order.brokerStatus,
      filledQuantity: parseFloat(order.filledQuantity.toString()),
      averageFillPrice: order.averageFillPrice ? parseFloat(order.averageFillPrice.toString()) : undefined,
      totalFillValue: order.totalFillValue ? parseFloat(order.totalFillValue.toString()) : undefined,
      commission: parseFloat(order.commission.toString()),
      riskValidationCode: order.riskValidationCode,
      riskValidationMessage: order.riskValidationMessage,
      rejectionReason: order.rejectionReason,
      rejectionCode: order.rejectionCode,
      needsReconciliation: order.needsReconciliation,
      submittedAt: order.submittedAt,
      filledAt: order.filledAt,
      cancelledAt: order.cancelledAt,
      rejectedAt: order.rejectedAt,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }
}
