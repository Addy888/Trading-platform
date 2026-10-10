import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BrokerOrderService } from './broker-order.service';
import { PlaceOrderDto } from './dto/place-order.dto';

/**
 * Broker Order Controller
 * 
 * Day 3: Real Broker Order Execution API
 * 
 * Endpoints:
 * - POST /api/broker-orders - Place new order
 * - GET /api/broker-orders - List user's orders
 * - GET /api/broker-orders/:id - Get order by ID
 * - DELETE /api/broker-orders/:id - Cancel order
 * - POST /api/broker-orders/:id/reconcile - Reconcile order status
 * 
 * Security:
 * - All endpoints require JWT authentication
 * - User ownership verified for all operations
 * - Rate limiting applied (TODO: implement rate limiter)
 */
@Controller('broker-orders')
@UseGuards(JwtAuthGuard)
export class BrokerOrderController {
  constructor(private brokerOrderService: BrokerOrderService) {}

  /**
   * Place a new order
   * 
   * POST /api/broker-orders
   * 
   * @param req - Authenticated request with user
   * @param placeOrderDto - Order parameters
   * @returns Order response with status
   */
  @Post()
  async placeOrder(@Request() req: any, @Body() placeOrderDto: PlaceOrderDto) {
    const userId = req.user.userId;

    if (!userId) {
      throw new HttpException(
        {
          error: 'UNAUTHORIZED',
          message: 'User ID not found in token',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    return this.brokerOrderService.placeOrder(userId, placeOrderDto);
  }

  /**
   * List user's orders
   * 
   * GET /api/broker-orders?tradingAccountId=xxx&page=1&pageSize=50
   * 
   * @param req - Authenticated request
   * @param tradingAccountId - Optional filter by trading account
   * @param page - Page number (default: 1)
   * @param pageSize - Page size (default: 50, max: 100)
   * @returns Paginated order list
   */
  @Get()
  async listOrders(
    @Request() req: any,
    @Query('tradingAccountId') tradingAccountId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const userId = req.user.userId;

    const pageNum = page ? parseInt(page, 10) : 1;
    const pageSizeNum = pageSize ? Math.min(parseInt(pageSize, 10), 100) : 50;

    return this.brokerOrderService.listOrders(userId, tradingAccountId, pageNum, pageSizeNum);
  }

  /**
   * Get order by ID
   * 
   * GET /api/broker-orders/:id
   * 
   * @param req - Authenticated request
   * @param id - Order ID
   * @returns Order details
   */
  @Get(':id')
  async getOrder(@Request() req: any, @Param('id') id: string) {
    const userId = req.user.userId;
    return this.brokerOrderService.getOrder(userId, id);
  }

  /**
   * Cancel an order
   * 
   * DELETE /api/broker-orders/:id
   * 
   * @param req - Authenticated request
   * @param id - Order ID
   * @returns Cancellation response
   */
  @Delete(':id')
  async cancelOrder(@Request() req: any, @Param('id') id: string) {
    const userId = req.user.userId;
    return this.brokerOrderService.cancelOrder(userId, id);
  }

  /**
   * Reconcile order status with broker
   * 
   * POST /api/broker-orders/:id/reconcile
   * 
   * Used to resolve uncertain order states (timeouts, etc.)
   * Queries broker for actual order status
   * 
   * @param req - Authenticated request
   * @param id - Order ID
   * @returns Updated order with reconciled status
   */
  @Post(':id/reconcile')
  async reconcileOrder(@Request() req: any, @Param('id') id: string) {
    const userId = req.user.userId;
    return this.brokerOrderService.reconcileOrder(userId, id);
  }
}
