import { Controller, Get, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersQueryDto } from './dto/orders-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(@Body() createOrderDto: CreateOrderDto, @Request() req) {
    return this.ordersService.create(createOrderDto, req.user.sub);
  }

  @Get()
  findUserOrders(@Query() query: OrdersQueryDto, @Request() req) {
    return this.ordersService.findUserOrders(req.user.sub, query);
  }

  @Get(':id')
  findUserOrder(@Param('id') id: string, @Request() req) {
    return this.ordersService.findUserOrder(id, req.user.sub);
  }

  @Post(':id/test-pay')
  testPayment(@Param('id') id: string, @Request() req) {
    return this.ordersService.testPayment(id, req.user.sub);
  }
}

@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAllOrders(@Query() query: OrdersQueryDto) {
    return this.ordersService.findAllOrders(query);
  }

  @Get(':id')
  findOrderById(@Param('id') id: string) {
    return this.ordersService.findOrderById(id);
  }

  @Post(':id/approve-payment')
  approvePayment(@Param('id') id: string, @Request() req) {
    return this.ordersService.approvePayment(id, req.user.sub);
  }

  @Post(':id/reject-payment')
  rejectPayment(@Param('id') id: string, @Body() body: { reason?: string }, @Request() req) {
    return this.ordersService.rejectPayment(id, req.user.sub, body.reason);
  }
}
