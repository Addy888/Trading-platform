import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRuleSetDto } from './dto/create-rule-set.dto';
import { UpdateRuleSetDto } from './dto/update-rule-set.dto';

@Injectable()
export class RuleSetsService {
  constructor(private prisma: PrismaService) {}

  async create(createRuleSetDto: CreateRuleSetDto, actorId: string) {
    const ruleSet = await this.prisma.ruleSet.create({
      data: createRuleSetDto,
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'RULE_SET_CREATED',
        entityType: 'RuleSet',
        entityId: ruleSet.id,
        metadata: { name: ruleSet.name },
      },
    });

    return ruleSet;
  }

  async findAll() {
    return this.prisma.ruleSet.findMany({
      include: {
        ruleSetRules: {
          include: {
            rule: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const ruleSet = await this.prisma.ruleSet.findUnique({
      where: { id },
      include: {
        ruleSetRules: {
          include: {
            rule: true,
          },
        },
      },
    });

    if (!ruleSet) {
      throw new NotFoundException(`Rule set with ID ${id} not found`);
    }

    return ruleSet;
  }

  async update(id: string, updateRuleSetDto: UpdateRuleSetDto, actorId: string) {
    await this.findOne(id);

    const ruleSet = await this.prisma.ruleSet.update({
      where: { id },
      data: updateRuleSetDto,
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'RULE_SET_UPDATED',
        entityType: 'RuleSet',
        entityId: ruleSet.id,
        metadata: updateRuleSetDto as any,
      },
    });

    return ruleSet;
  }

  async updateStatus(id: string, isActive: boolean, actorId: string) {
    await this.findOne(id);

    const ruleSet = await this.prisma.ruleSet.update({
      where: { id },
      data: { isActive },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'RULE_SET_STATUS_CHANGED',
        entityType: 'RuleSet',
        entityId: ruleSet.id,
        metadata: { isActive },
      },
    });

    return ruleSet;
  }

  async addRule(ruleSetId: string, ruleId: string, actorId: string) {
    const ruleSet = await this.findOne(ruleSetId);

    const ruleExists = await this.prisma.tradingRule.findUnique({
      where: { id: ruleId },
    });

    if (!ruleExists) {
      throw new NotFoundException(`Trading rule with ID ${ruleId} not found`);
    }

    const existingAssignment = await this.prisma.ruleSetRule.findFirst({
      where: {
        ruleSetId,
        ruleId,
      },
    });

    if (existingAssignment) {
      throw new ConflictException('This rule is already assigned to this rule set');
    }

    const ruleSetRule = await this.prisma.ruleSetRule.create({
      data: {
        ruleSetId,
        ruleId,
      },
      include: {
        rule: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'RULE_ADDED_TO_SET',
        entityType: 'RuleSet',
        entityId: ruleSetId,
        metadata: { ruleId, ruleName: ruleExists.name },
      },
    });

    return ruleSetRule;
  }

  async removeRule(ruleSetId: string, ruleId: string, actorId: string) {
    const ruleSet = await this.findOne(ruleSetId);

    const ruleSetRule = await this.prisma.ruleSetRule.findFirst({
      where: {
        ruleSetId,
        ruleId,
      },
    });

    if (!ruleSetRule) {
      throw new NotFoundException('Rule assignment not found in this rule set');
    }

    await this.prisma.ruleSetRule.delete({
      where: { id: ruleSetRule.id },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'RULE_REMOVED_FROM_SET',
        entityType: 'RuleSet',
        entityId: ruleSetId,
        metadata: { ruleId },
      },
    });

    return { message: 'Rule removed from set successfully' };
  }
}
