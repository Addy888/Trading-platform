import { Controller, Get, Post, Body, Patch, Param, UseGuards, Request } from '@nestjs/common';
import { ChallengePlansService } from './challenge-plans.service';
import { CreateChallengePlanDto } from './dto/create-challenge-plan.dto';
import { UpdateChallengePlanDto } from './dto/update-challenge-plan.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('admin/challenge-plans')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminChallengePlansController {
  constructor(private readonly challengePlansService: ChallengePlansService) {}

  @Post()
  create(@Body() createChallengePlanDto: CreateChallengePlanDto, @Request() req) {
    return this.challengePlansService.create(createChallengePlanDto, req.user.sub);
  }

  @Get()
  findAll() {
    return this.challengePlansService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.challengePlansService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateChallengePlanDto: UpdateChallengePlanDto,
    @Request() req,
  ) {
    return this.challengePlansService.update(id, updateChallengePlanDto, req.user.sub);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateStatusDto,
    @Request() req,
  ) {
    return this.challengePlansService.updateStatus(id, updateStatusDto.status, req.user.sub);
  }
}

@Controller('challenge-plans')
export class PublicChallengePlansController {
  constructor(private readonly challengePlansService: ChallengePlansService) {}

  @Get()
  findAllActive() {
    return this.challengePlansService.findAllActive();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.challengePlansService.findOne(id);
  }
}
