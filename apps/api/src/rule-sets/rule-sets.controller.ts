import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { RuleSetsService } from './rule-sets.service';
import { CreateRuleSetDto } from './dto/create-rule-set.dto';
import { UpdateRuleSetDto } from './dto/update-rule-set.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { AddRuleDto } from './dto/add-rule.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('admin/rule-sets')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class RuleSetsController {
  constructor(private readonly ruleSetsService: RuleSetsService) {}

  @Post()
  create(@Body() createRuleSetDto: CreateRuleSetDto, @Request() req) {
    return this.ruleSetsService.create(createRuleSetDto, req.user.sub);
  }

  @Get()
  findAll() {
    return this.ruleSetsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ruleSetsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateRuleSetDto: UpdateRuleSetDto,
    @Request() req,
  ) {
    return this.ruleSetsService.update(id, updateRuleSetDto, req.user.sub);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateStatusDto,
    @Request() req,
  ) {
    return this.ruleSetsService.updateStatus(id, updateStatusDto.isActive, req.user.sub);
  }

  @Post(':id/rules')
  addRule(
    @Param('id') id: string,
    @Body() addRuleDto: AddRuleDto,
    @Request() req,
  ) {
    return this.ruleSetsService.addRule(id, addRuleDto.ruleId, req.user.sub);
  }

  @Delete(':id/rules/:ruleId')
  removeRule(
    @Param('id') id: string,
    @Param('ruleId') ruleId: string,
    @Request() req,
  ) {
    return this.ruleSetsService.removeRule(id, ruleId, req.user.sub);
  }
}
