import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  NotFoundException,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { AdminService } from './admin.service';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { SendNotificationDto } from './dto/send-notification.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('test')
  testAdminAccess() {
    return {
      message: 'Admin access granted',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('dashboard')
  async getDashboard() {
    return this.adminService.getDashboardStats();
  }

  @Get('health')
  async getHealth() {
    return this.adminService.getHealth();
  }

  @Get('users')
  async getUsers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('role') role?: Role,
    @Query('status') status?: 'active' | 'inactive',
  ) {
    return this.adminService.getUsers(page, limit, search, role, status);
  }

  @Get('users/:id')
  async getUserById(@Param('id') id: string) {
    return this.adminService.getUserById(id);
  }

  @Patch('users/:id/status')
  async updateUserStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateUserStatusDto,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.adminService.updateUserStatus(
      id,
      updateStatusDto.isActive,
      adminId,
    );
  }

  @Get('audit-logs')
  async getAuditLogs(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('action') action?: string,
    @Query('actorId') actorId?: string,
  ) {
    return this.adminService.getAuditLogs(page, limit, search, action, actorId);
  }

  @Post('notifications/send')
  async sendNotification(
    @Body() dto: SendNotificationDto,
    @CurrentUser('sub') adminId: string,
  ) {
    const broadcastToAll = dto.broadcastToAll === 'true';
    return this.adminService.sendNotification(
      adminId,
      dto.userId,
      dto.userIds,
      broadcastToAll,
      dto.type,
      dto.priority,
      dto.title,
      dto.message,
      dto.data,
    );
  }
}
