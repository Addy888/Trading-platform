import { Controller, Get, Post, Body, Patch, Param, UseGuards, Request } from '@nestjs/common';
import { TradingRulesService } from './trading-rules.service';
import { CreateTradingRuleDto } from './dto/create-trading-rule.dto';
import { UpdateTradingRuleDto } from './dto/update-trading-rule.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('admin/trading-rules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class TradingRulesController {
  constructor(private readonly tradingRulesService: TradingRulesService) {}

  @Post()
  create(@Body() createTradingRuleDto: CreateTradingRuleDto, @Request() req) {
    return this.tradingRulesService.create(createTradingRuleDto, req.user.sub);
  }

  @Get()
  findAll() {
    return this.tradingRulesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tradingRulesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateTradingRuleDto: UpdateTradingRuleDto,
    @Request() req,
  ) {
    return this.tradingRulesService.update(id, updateTradingRuleDto, req.user.sub);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateStatusDto,
    @Request() req,
  ) {
    return this.tradingRulesService.updateStatus(id, updateStatusDto.isActive, req.user.sub);
  }
}
