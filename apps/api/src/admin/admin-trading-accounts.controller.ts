import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role, TradingAccountStatus } from '@prisma/client';
import { AdminTradingAccountsService } from './admin-trading-accounts.service';
import { UpdateTradingAccountStatusDto } from './dto/update-trading-account-status.dto';

@Controller('admin/trading-accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminTradingAccountsController {
  constructor(
    private readonly adminTradingAccountsService: AdminTradingAccountsService,
  ) {}

  @Get()
  async getTradingAccounts(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
    @Query('status') status?: TradingAccountStatus,
    @Query('challengePlanId') challengePlanId?: string,
  ) {
    return this.adminTradingAccountsService.getTradingAccounts(
      page,
      limit,
      search,
      status,
      challengePlanId,
    );
  }

  @Get(':id')
  async getTradingAccountById(@Param('id') id: string) {
    return this.adminTradingAccountsService.getTradingAccountById(id);
  }

  @Patch(':id/status')
  async updateTradingAccountStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateTradingAccountStatusDto,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.adminTradingAccountsService.updateTradingAccountStatus(
      id,
      updateStatusDto.status,
      adminId,
    );
  }
}
