import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { SettingsService } from './settings.service';
import { CreateSettingDto, UpdateSettingDto } from './dto/settings.dto';

@Controller('admin/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  async getAllSettings(
    @Query('category') category?: string,
    @Query('isPublic') isPublic?: string,
  ) {
    const isPublicFilter = isPublic === 'true' ? true : isPublic === 'false' ? false : undefined;
    return this.settingsService.getAllSettings(category, isPublicFilter);
  }

  @Get(':key')
  async getSettingByKey(@Param('key') key: string) {
    return this.settingsService.getSettingByKey(key);
  }

  @Post()
  async createSetting(
    @Body() dto: CreateSettingDto,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.settingsService.createSetting(dto, adminId);
  }

  @Put(':key')
  async updateSetting(
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.settingsService.updateSetting(key, dto, adminId);
  }

  @Delete(':key')
  async deleteSetting(
    @Param('key') key: string,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.settingsService.deleteSetting(key, adminId);
  }
}
