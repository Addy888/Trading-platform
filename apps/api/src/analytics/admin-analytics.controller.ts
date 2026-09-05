import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { AdminAnalyticsService } from './admin-analytics.service';

@Controller('analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminAnalyticsController {
  constructor(private readonly adminAnalyticsService: AdminAnalyticsService) {}

  @Get('admin')
  async getAdminAnalytics(@Query('timeRange') timeRange: string = '30d') {
    return this.adminAnalyticsService.getAdminAnalytics(timeRange);
  }
}
