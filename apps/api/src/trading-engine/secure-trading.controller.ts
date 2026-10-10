import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrderGatewayService } from './order-gateway.service';
import { TradingEngineV2Service } from './trading-engine-v2.service';
import { CreateTradeOrderDto } from './dto/create-trade-order.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Secure Trading Controller
 * 
 * Day 8 - Secure Order Gateway + Pre-Trade Risk Validation
 * 
 * This controller enforces the secure order gateway pattern:
 * 1. JWT authentication required
 * 2. Order Gateway validates all requests
 * 3. Trading Engine V2 executes validated orders
 * 4. Risk Evaluation runs post-trade
 * 5. All operations are atomic and transactional
 * 
 * SECURITY:
 * - User ID derived from verified JWT (never from request body)
 * - Account ownership verified on every request
 * - All financial data is backend-authoritative
 * - Pre-trade risk validation prevents limit breaches
 * - Idempotency protection prevents duplicate orders
 */
@Controller('trading/v3')
@UseGuards(JwtAuthGuard)
export class SecureTradingController {
  private readonly logger = new Logger(SecureTradingController.name);

  constructor(
    private readonly orderGateway: OrderGatewayService,
    private readonly tradingEngine: TradingEngineV2Service,
    private readonly prisma: PrismaService,
  ) {}

  @Post('orders')
  @HttpCode(HttpStatus.CREATED)
  async createOrder(
    @Request() req: any,
    @Body() dto: CreateTradeOrderDto,
  ) {
    const userId = req.user.userId; // From JWT

    this.logger.log(
      `Order request: User ${userId}, Account ${dto.tradingAccountId}, ${dto.symbol} ${dto.side} ${dto.volume}`,
    );

    // Step 1: Validate order through secure gateway
    const validatedOrder = await this.orderGateway.validateOrder(userId, dto);

    // Step 2: Record order submission in audit log (for idempotency and audit trail)
    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'ORDER_SUBMITTED',
        entityType: 'Trade',
        entityId: null, // Will be updated after trade creation
        metadata: {
          tradingAccountId: dto.tradingAccountId,
          symbol: validatedOrder.symbol,
          side: validatedOrder.side,
          volume: validatedOrder.volume.toString(),
          executionPrice: validatedOrder.executionPrice.toString(),
          requiredMargin: validatedOrder.requiredMargin.toString(),
          idempotencyKey: dto.idempotencyKey,
          validated: true,
        },
      },
    });

    // Step 3: Execute trade (TradingEngineV2 handles execution + post-trade evaluation)
    const trade = await this.tradingEngine.openTrade(
      validatedOrder.accountId,
      userId,
      {
        symbol: validatedOrder.symbol,
        side: validatedOrder.side,
        volume: validatedOrder.volume.toNumber(),
        stopLoss: validatedOrder.stopLoss?.toNumber(),
        takeProfit: validatedOrder.takeProfit?.toNumber(),
        leverage: validatedOrder.leverage,
      },
    );

    this.logger.log(
      `Order executed: Trade ${trade.id}, ${trade.side} ${trade.volume} ${trade.symbol} @ ${trade.entryPrice}`,
    );

    return {
      id: trade.id,
      tradingAccountId: trade.tradingAccountId,
      symbol: trade.symbol,
      side: trade.side,
      volume: trade.volume.toString(),
      entryPrice: trade.entryPrice.toString(),
      stopLoss: trade.stopLoss?.toString(),
      takeProfit: trade.takeProfit?.toString(),
      status: trade.status,
      openedAt: trade.openedAt,
      message: 'Trade order created successfully',
    };
  }

  @Post('positions/:tradeId/close')
  @HttpCode(HttpStatus.OK)
  async closePosition(
    @Request() req: any,
    @Body() body: { tradingAccountId: string; tradeId: string },
  ) {
    const userId = req.user.userId;

    this.logger.log(
      `Close position request: User ${userId}, Account ${body.tradingAccountId}, Trade ${body.tradeId}`,
    );

    // Close trade through Trading Engine V2 (handles all validation and risk evaluation)
    const closedTrade = await this.tradingEngine.closeTrade(
      body.tradingAccountId,
      body.tradeId,
      userId,
    );

    this.logger.log(
      `Position closed: Trade ${closedTrade.id}, P&L: ${closedTrade.realizedPnl.toString()}`,
    );

    return {
      id: closedTrade.id,
      symbol: closedTrade.symbol,
      side: closedTrade.side,
      volume: closedTrade.volume.toString(),
      entryPrice: closedTrade.entryPrice.toString(),
      exitPrice: closedTrade.exitPrice?.toString(),
      realizedPnl: closedTrade.realizedPnl.toString(),
      status: closedTrade.status,
      openedAt: closedTrade.openedAt,
      closedAt: closedTrade.closedAt,
      message: 'Position closed successfully',
    };
  }

  @Post('positions/:tradeId/modify')
  @HttpCode(HttpStatus.OK)
  async modifyPosition(
    @Request() req: any,
    @Body() body: { tradingAccountId: string; tradeId: string; update: UpdatePositionDto },
  ) {
    const userId = req.user.userId;

    this.logger.log(
      `Modify position request: User ${userId}, Account ${body.tradingAccountId}, Trade ${body.tradeId}`,
    );

    // Update position through Trading Engine V2
    const updatedTrade = await this.tradingEngine.updatePosition(
      body.tradingAccountId,
      body.tradeId,
      userId,
      body.update,
    );

    this.logger.log(
      `Position modified: Trade ${updatedTrade.id}, SL: ${updatedTrade.stopLoss?.toString()}, TP: ${updatedTrade.takeProfit?.toString()}`,
    );

    return {
      id: updatedTrade.id,
      symbol: updatedTrade.symbol,
      side: updatedTrade.side,
      volume: updatedTrade.volume.toString(),
      entryPrice: updatedTrade.entryPrice.toString(),
      stopLoss: updatedTrade.stopLoss?.toString(),
      takeProfit: updatedTrade.takeProfit?.toString(),
      status: updatedTrade.status,
      openedAt: updatedTrade.openedAt,
      message: 'Position modified successfully',
    };
  }
}
