import {
  Controller,
  Get,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';
import { Role } from '@prisma/client';

/**
 * Dashboard Controller
 * 
 * Endpoints:
 * - GET /api/dashboard - User dashboard summary
 * - GET /api/admin/dashboard - Admin dashboard summary
 */
@Controller()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * Get user dashboard
   * GET /api/dashboard
   */
  @Get('dashboard')
  @UseGuards(JwtAuthGuard)
  async getUserDashboard(@Request() req) {
    const userId = req.user.userId;
    return this.dashboardService.getUserDashboard(userId);
  }

  /**
   * Get admin dashboard
   * GET /api/admin/dashboard
   */
  @Get('admin/dashboard')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async getAdminDashboard() {
    return this.dashboardService.getAdminDashboard();
  }
}
