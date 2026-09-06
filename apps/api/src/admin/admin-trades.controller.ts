import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { AdminTradesService } from './admin-trades.service';

@Controller('admin/trades')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminTradesController {
  constructor(private readonly adminTradesService: AdminTradesService) {}

  @Get()
  async getTrades(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('symbol') symbol?: string,
    @Query('userId') userId?: string,
    @Query('accountId') accountId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('search') search?: string,
  ) {
    return this.adminTradesService.getTrades({
      page,
      limit,
      status,
      symbol,
      userId,
      accountId,
      startDate,
      endDate,
      search,
    });
  }

  @Get('stats')
  async getTradeStats() {
    return this.adminTradesService.getTradeStats();
  }

  @Get(':id')
  async getTradeById(@Param('id') id: string) {
    return this.adminTradesService.getTradeById(id);
  }
}
