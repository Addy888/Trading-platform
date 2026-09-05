import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { AdminPayoutsService } from './admin-payouts.service';

@Controller('admin/payouts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminPayoutsController {
  constructor(private adminPayoutsService: AdminPayoutsService) {}

  @Get()
  async getPayouts(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('userId') userId?: string,
  ) {
    return this.adminPayoutsService.getPayouts(
      page,
      limit,
      search,
      status,
      userId,
    );
  }

  @Get('stats')
  async getPayoutStats() {
    return this.adminPayoutsService.getPayoutStats();
  }

  @Get(':id')
  async getPayoutById(@Param('id') id: string) {
    return this.adminPayoutsService.getPayoutById(id);
  }

  @Post(':id/approve')
  async approvePayout(
    @Param('id') id: string,
    @Body() dto: { notes?: string },
    @CurrentUser('sub') adminId: string,
  ) {
    return this.adminPayoutsService.approvePayout(id, adminId, dto.notes);
  }

  @Post(':id/reject')
  async rejectPayout(
    @Param('id') id: string,
    @Body() dto: { reason: string },
    @CurrentUser('sub') adminId: string,
  ) {
    return this.adminPayoutsService.rejectPayout(id, adminId, dto.reason);
  }

  @Post(':id/mark-paid')
  async markPayoutPaid(
    @Param('id') id: string,
    @Body() dto: { reference: string },
    @CurrentUser('sub') adminId: string,
  ) {
    return this.adminPayoutsService.markPayoutPaid(id, adminId, dto.reference);
  }
}
