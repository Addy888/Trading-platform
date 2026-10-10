import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UnifiedMarketDataService } from '../../market-data/unified-market-data.service';
import { MarketDataSource } from '../../market-data/dto/normalized-tick.dto';
import { OrderType } from '../dto/place-order.dto';
import { BrokerOrderStatus } from '../dto/order-response.dto';
import Decimal from 'decimal.js';

/**
 * Paper Order Adapter
 * 
 * Day 6: Local paper trading execution
 * 
 * Provides realistic order simulation with:
 * - Real market data from Twelve Data for fills
 * - Simulated broker latency (50-200ms)
 * - Realistic order lifecycle states
 * - No external broker API calls
 * - Clearly labeled as paper/simulated fills
 * 
 * IMPORTANT: This is NOT connected to a real broker
 * All fills are simulated locally based on market data
 */
@Injectable()
export class PaperOrderAdapter {
  private readonly logger = new Logger(PaperOrderAdapter.name);
  
  // Simulated latency ranges (milliseconds)
  private readonly MIN_LATENCY = 50;
  private readonly MAX_LATENCY = 200;
  
  // Market order slippage range (percentage)
  private readonly MIN_SLIPPAGE = 0.0001; // 0.01%
  private readonly MAX_SLIPPAGE = 0.001;  // 0.1%
  
  // Rejection probability (10% for realism)
  private readonly REJECTION_PROBABILITY = 0.1;

  constructor(
    private prisma: PrismaService,
    private marketData: UnifiedMarketDataService,
  ) {}

  /**
   * Execute paper order with simulated broker workflow
   * 
   * @param orderId - Database order ID
   * @returns Updated order with SUBMITTED/FILLED status
   */
  async executePaperOrder(orderId: string): Promise<void> {
    this.logger.log(`[PAPER] Executing paper order: ${orderId}`);

    // Simulate broker acknowledgment latency
    const acknowledgmentLatency = this.getRandomLatency();
    await this.sleep(acknowledgmentLatency);

    // Get order details
    const order = await this.prisma.brokerOrder.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      this.logger.error(`[PAPER] Order not found: ${orderId}`);
      return;
    }

    // Update status to SUBMITTED (broker acknowledged)
    await this.prisma.brokerOrder.update({
      where: { id: orderId },
      data: {
        status: BrokerOrderStatus.SUBMITTED,
        statusMessage: 'Paper order acknowledged (simulated)',
        submittedAt: new Date(),
      },
    });

    await this.prisma.brokerOrderStatusHistory.create({
      data: {
        brokerOrderId: orderId,
        previousStatus: BrokerOrderStatus.PENDING_SUBMISSION,
        newStatus: BrokerOrderStatus.SUBMITTED,
        statusMessage: 'Paper order acknowledged (simulated)',
        changedAt: new Date(),
      },
    });

    this.logger.log(`[PAPER] Order ${orderId} acknowledged in ${acknowledgmentLatency}ms`);

    // Randomly reject some orders for realism
    if (this.shouldReject()) {
      await this.rejectOrder(orderId);
      return;
    }

    // Execute order based on type
    if (order.orderType === OrderType.MARKET) {
      await this.fillMarketOrder(orderId, order);
    } else {
      // For LIMIT orders, mark as OPEN (pending fill)
      await this.prisma.brokerOrder.update({
        where: { id: orderId },
        data: {
          status: BrokerOrderStatus.OPEN,
          statusMessage: 'Paper limit order open (waiting for price)',
          acceptedAt: new Date(),
        },
      });

      await this.prisma.brokerOrderStatusHistory.create({
        data: {
          brokerOrderId: orderId,
          previousStatus: BrokerOrderStatus.SUBMITTED,
          newStatus: BrokerOrderStatus.OPEN,
          statusMessage: 'Paper limit order open (waiting for price)',
          changedAt: new Date(),
        },
      });

      this.logger.log(`[PAPER] Limit order ${orderId} is now OPEN`);
    }
  }

  /**
   * Fill market order with simulated execution
   */
  private async fillMarketOrder(orderId: string, order: any): Promise<void> {
    this.logger.log(`[PAPER] Filling market order: ${orderId}`);

    try {
      // Get current market price
      const marketPrice = await this.getMarketPrice(order.symbol);

      if (!marketPrice) {
        this.logger.error(`[PAPER] No market price for ${order.symbol}, rejecting order`);
        await this.rejectOrder(orderId, 'No market price available');
        return;
      }

      // Apply slippage for market orders
      const slippagePercent = this.getRandomSlippage();
      const slippageMultiplier = order.side === 'BUY' 
        ? new Decimal(1).plus(slippagePercent)
        : new Decimal(1).minus(slippagePercent);
      
      const fillPrice = marketPrice.times(slippageMultiplier);
      const quantity = new Decimal(order.quantity.toString());
      const totalValue = fillPrice.times(quantity);

      // Simulate fill latency
      const fillLatency = this.getRandomLatency();
      await this.sleep(fillLatency);

      // Update order as FILLED
      await this.prisma.brokerOrder.update({
        where: { id: orderId },
        data: {
          status: BrokerOrderStatus.FILLED,
          statusMessage: `Paper order filled (simulated with real market data)`,
          filledQuantity: quantity,
          averageFillPrice: fillPrice,
          totalFillValue: totalValue,
          commission: new Decimal(0), // No commission in paper trading
          filledAt: new Date(),
        },
      });

      await this.prisma.brokerOrderStatusHistory.create({
        data: {
          brokerOrderId: orderId,
          previousStatus: BrokerOrderStatus.SUBMITTED,
          newStatus: BrokerOrderStatus.FILLED,
          statusMessage: `Filled at ${fillPrice.toFixed(5)} (slippage: ${slippagePercent.times(100).toFixed(4)}%)`,
          brokerResponse: {
            paperTrading: true,
            marketPrice: marketPrice.toNumber(),
            fillPrice: fillPrice.toNumber(),
            slippage: slippagePercent.toNumber(),
            latency: fillLatency,
          } as any,
          changedAt: new Date(),
        },
      });

      this.logger.log(
        `[PAPER] ✓ Order ${orderId} filled at ${fillPrice.toFixed(5)} ` +
        `(market: ${marketPrice.toFixed(5)}, slippage: ${slippagePercent.times(100).toFixed(4)}%)`
      );
    } catch (error) {
      this.logger.error(`[PAPER] Fill failed for ${orderId}: ${(error as Error).message}`);
      await this.rejectOrder(orderId, `Fill failed: ${(error as Error).message}`);
    }
  }

  /**
   * Reject order with reason
   */
  private async rejectOrder(orderId: string, reason?: string): Promise<void> {
    const rejectionReason = reason || this.getRandomRejectionReason();
    
    this.logger.warn(`[PAPER] Rejecting order ${orderId}: ${rejectionReason}`);

    await this.prisma.brokerOrder.update({
      where: { id: orderId },
      data: {
        status: BrokerOrderStatus.REJECTED,
        statusMessage: `Paper order rejected (simulated): ${rejectionReason}`,
        rejectionReason,
        rejectionCode: 'PAPER_SIMULATED_REJECTION',
        rejectedAt: new Date(),
      },
    });

    await this.prisma.brokerOrderStatusHistory.create({
      data: {
        brokerOrderId: orderId,
        previousStatus: BrokerOrderStatus.SUBMITTED,
        newStatus: BrokerOrderStatus.REJECTED,
        statusMessage: rejectionReason,
        changedAt: new Date(),
      },
    });
  }

  /**
   * Get current market price from Twelve Data
   */
  private async getMarketPrice(symbol: string): Promise<Decimal | null> {
    try {
      // Try to get real market data
      const quoteResponse = this.marketData.getQuote(symbol, MarketDataSource.TWELVEDATA);
      
      if (quoteResponse.available && quoteResponse.tick?.lastTradedPrice) {
        return quoteResponse.tick.lastTradedPrice;
      }

      this.logger.warn(`[PAPER] No quote available for ${symbol}: ${quoteResponse.reason || 'Unknown'}`);
      return null;
    } catch (error) {
      this.logger.error(`[PAPER] Failed to get market price for ${symbol}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Cancel paper order
   */
  async cancelPaperOrder(orderId: string): Promise<void> {
    this.logger.log(`[PAPER] Cancelling paper order: ${orderId}`);

    const order = await this.prisma.brokerOrder.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    // Simulate cancellation latency
    await this.sleep(this.getRandomLatency());

    await this.prisma.brokerOrder.update({
      where: { id: orderId },
      data: {
        status: BrokerOrderStatus.CANCELLED,
        statusMessage: 'Paper order cancelled (simulated)',
        cancelledAt: new Date(),
      },
    });

    await this.prisma.brokerOrderStatusHistory.create({
      data: {
        brokerOrderId: orderId,
        previousStatus: order.status,
        newStatus: BrokerOrderStatus.CANCELLED,
        statusMessage: 'Paper order cancelled (simulated)',
        changedAt: new Date(),
      },
    });

    this.logger.log(`[PAPER] ✓ Order ${orderId} cancelled`);
  }

  /**
   * Get order status (for paper orders)
   */
  async getPaperOrderStatus(orderId: string): Promise<any> {
    const order = await this.prisma.brokerOrder.findUnique({
      where: { id: orderId },
      include: {
        statusHistory: {
          orderBy: { changedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    return {
      orderId: order.id,
      status: order.status,
      statusMessage: order.statusMessage,
      paperTrading: true,
      filledQuantity: order.filledQuantity.toString(),
      averageFillPrice: order.averageFillPrice?.toString(),
      lastUpdate: order.updatedAt,
    };
  }

  /**
   * Utility: Random latency between MIN and MAX
   */
  private getRandomLatency(): number {
    return Math.floor(
      Math.random() * (this.MAX_LATENCY - this.MIN_LATENCY) + this.MIN_LATENCY
    );
  }

  /**
   * Utility: Random slippage for market orders
   */
  private getRandomSlippage(): Decimal {
    const slippage = Math.random() * (this.MAX_SLIPPAGE - this.MIN_SLIPPAGE) + this.MIN_SLIPPAGE;
    return new Decimal(slippage);
  }

  /**
   * Utility: Should this order be rejected (10% probability)
   */
  private shouldReject(): boolean {
    return Math.random() < this.REJECTION_PROBABILITY;
  }

  /**
   * Utility: Random rejection reason
   */
  private getRandomRejectionReason(): string {
    const reasons = [
      'Insufficient simulated margin',
      'Symbol not tradeable in paper mode',
      'Market closed',
      'Order size too large',
      'Simulated system error',
    ];
    
    return reasons[Math.floor(Math.random() * reasons.length)];
  }

  /**
   * Utility: Sleep for X milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
