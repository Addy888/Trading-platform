import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTradingRuleDto } from './dto/create-trading-rule.dto';
import { UpdateTradingRuleDto } from './dto/update-trading-rule.dto';

@Injectable()
export class TradingRulesService {
  constructor(private prisma: PrismaService) {}

  async create(createTradingRuleDto: CreateTradingRuleDto, actorId: string) {
    const rule = await this.prisma.tradingRule.create({
      data: {
        ...createTradingRuleDto,
        value: createTradingRuleDto.value,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'TRADING_RULE_CREATED',
        entityType: 'TradingRule',
        entityId: rule.id,
        metadata: { name: rule.name, type: rule.type },
      },
    });

    return rule;
  }

  async findAll() {
    return this.prisma.tradingRule.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const rule = await this.prisma.tradingRule.findUnique({
      where: { id },
    });

    if (!rule) {
      throw new NotFoundException(`Trading rule with ID ${id} not found`);
    }

    return rule;
  }

  async update(id: string, updateTradingRuleDto: UpdateTradingRuleDto, actorId: string) {
    await this.findOne(id);

    const rule = await this.prisma.tradingRule.update({
      where: { id },
      data: updateTradingRuleDto,
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'TRADING_RULE_UPDATED',
        entityType: 'TradingRule',
        entityId: rule.id,
        metadata: updateTradingRuleDto as any,
      },
    });

    return rule;
  }

  async updateStatus(id: string, isActive: boolean, actorId: string) {
    await this.findOne(id);

    const rule = await this.prisma.tradingRule.update({
      where: { id },
      data: { isActive },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'TRADING_RULE_STATUS_CHANGED',
        entityType: 'TradingRule',
        entityId: rule.id,
        metadata: { isActive },
      },
    });

    return rule;
  }
}
