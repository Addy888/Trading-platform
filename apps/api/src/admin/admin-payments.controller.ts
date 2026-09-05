import {
  Controller,
  Get,
  Param,
  Patch,
  Body,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { AdminPaymentsService } from './admin-payments.service';

@Controller('admin/payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminPaymentsController {
  constructor(private adminPaymentsService: AdminPaymentsService) {}

  @Get()
  async getPayments(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('provider') provider?: string,
  ) {
    return this.adminPaymentsService.getPayments(
      page,
      limit,
      search,
      status,
      provider,
    );
  }

  @Get('stats')
  async getPaymentStats() {
    return this.adminPaymentsService.getPaymentStats();
  }

  @Get(':id')
  async getPaymentById(@Param('id') id: string) {
    return this.adminPaymentsService.getPaymentById(id);
  }

  @Patch(':id/status')
  async updatePaymentStatus(
    @Param('id') id: string,
    @Body() dto: { status: string; notes?: string },
  ) {
    return this.adminPaymentsService.updatePaymentStatus(
      id,
      dto.status,
      dto.notes,
    );
  }
}
