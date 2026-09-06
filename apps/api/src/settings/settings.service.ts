import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSettingDto, UpdateSettingDto } from './dto/settings.dto';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getAllSettings(category?: string, isPublic?: boolean) {
    const where: any = {};
    if (category) where.category = category;
    if (isPublic !== undefined) where.isPublic = isPublic;

    const settings = await this.prisma.platformSettings.findMany({
      where,
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    });

    // Group by category
    const grouped = settings.reduce((acc, setting) => {
      const cat = setting.category || 'General';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(setting);
      return acc;
    }, {} as Record<string, any[]>);

    return {
      settings,
      grouped,
    };
  }

  async getSettingByKey(key: string) {
    const setting = await this.prisma.platformSettings.findUnique({
      where: { key },
    });

    if (!setting) {
      throw new NotFoundException(`Setting with key '${key}' not found`);
    }

    return setting;
  }

  async createSetting(dto: CreateSettingDto, adminId: string) {
    // Check if key already exists
    const existing = await this.prisma.platformSettings.findUnique({
      where: { key: dto.key },
    });

    if (existing) {
      throw new ConflictException(`Setting with key '${dto.key}' already exists`);
    }

    const setting = await this.prisma.platformSettings.create({
      data: {
        key: dto.key,
        value: dto.value,
        description: dto.description,
        category: dto.category,
        isPublic: dto.isPublic ?? false,
        updatedBy: adminId,
      },
    });

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'SETTING_CREATED',
        entityType: 'PlatformSettings',
        entityId: setting.id,
        metadata: {
          key: setting.key,
          category: setting.category,
        },
      },
    });

    return setting;
  }

  async updateSetting(key: string, dto: UpdateSettingDto, adminId: string) {
    const existing = await this.prisma.platformSettings.findUnique({
      where: { key },
    });

    if (!existing) {
      throw new NotFoundException(`Setting with key '${key}' not found`);
    }

    const setting = await this.prisma.platformSettings.update({
      where: { key },
      data: {
        value: dto.value ?? existing.value,
        description: dto.description ?? existing.description,
        category: dto.category ?? existing.category,
        isPublic: dto.isPublic ?? existing.isPublic,
        updatedBy: adminId,
      },
    });

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'SETTING_UPDATED',
        entityType: 'PlatformSettings',
        entityId: setting.id,
        metadata: {
          key: setting.key,
          previousValue: existing.value,
          newValue: setting.value,
        },
      },
    });

    return setting;
  }

  async deleteSetting(key: string, adminId: string) {
    const existing = await this.prisma.platformSettings.findUnique({
      where: { key },
    });

    if (!existing) {
      throw new NotFoundException(`Setting with key '${key}' not found`);
    }

    await this.prisma.platformSettings.delete({
      where: { key },
    });

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'SETTING_DELETED',
        entityType: 'PlatformSettings',
        entityId: existing.id,
        metadata: {
          key: existing.key,
          value: existing.value,
        },
      },
    });

    return { success: true, message: `Setting '${key}' deleted` };
  }
}
