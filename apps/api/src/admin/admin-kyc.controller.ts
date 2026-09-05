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
import { AdminKYCService } from './admin-kyc.service';

@Controller('admin/kyc')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminKYCController {
  constructor(private adminKYCService: AdminKYCService) {}

  @Get()
  async getKYCSubmissions(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('userId') userId?: string,
  ) {
    return this.adminKYCService.getKYCSubmissions(
      page,
      limit,
      search,
      status,
      userId,
    );
  }

  @Get('stats')
  async getKYCStats() {
    return this.adminKYCService.getKYCStats();
  }

  @Get(':id')
  async getKYCSubmissionById(@Param('id') id: string) {
    return this.adminKYCService.getKYCSubmissionById(id);
  }

  @Post(':id/approve')
  async approveKYC(
    @Param('id') id: string,
    @Body() dto: { notes?: string },
    @CurrentUser('sub') adminId: string,
  ) {
    return this.adminKYCService.approveKYC(id, adminId, dto.notes);
  }

  @Post(':id/reject')
  async rejectKYC(
    @Param('id') id: string,
    @Body() dto: { reason: string },
    @CurrentUser('sub') adminId: string,
  ) {
    return this.adminKYCService.rejectKYC(id, adminId, dto.reason);
  }

  @Post(':id/request-resubmission')
  async requestResubmission(
    @Param('id') id: string,
    @Body() dto: { reason: string },
    @CurrentUser('sub') adminId: string,
  ) {
    return this.adminKYCService.requestResubmission(id, adminId, dto.reason);
  }
}
