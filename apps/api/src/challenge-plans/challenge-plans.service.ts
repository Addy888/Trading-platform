import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChallengePlanDto } from './dto/create-challenge-plan.dto';
import { UpdateChallengePlanDto } from './dto/update-challenge-plan.dto';
import { ChallengeStatus } from '@prisma/client';

@Injectable()
export class ChallengePlansService {
  constructor(private prisma: PrismaService) {}

  async create(createChallengePlanDto: CreateChallengePlanDto, actorId: string) {
    const ruleSetExists = await this.prisma.ruleSet.findUnique({
      where: { id: createChallengePlanDto.ruleSetId },
    });

    if (!ruleSetExists) {
      throw new NotFoundException(`Rule set with ID ${createChallengePlanDto.ruleSetId} not found`);
    }

    const plan = await this.prisma.challengePlan.create({
      data: {
        ...createChallengePlanDto,
        accountSize: createChallengePlanDto.accountSize,
        price: createChallengePlanDto.price,
      },
      include: {
        ruleSet: {
          include: {
            ruleSetRules: {
              include: {
                rule: true,
              },
            },
          },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'CHALLENGE_PLAN_CREATED',
        entityType: 'ChallengePlan',
        entityId: plan.id,
        metadata: { name: plan.name, accountSize: plan.accountSize.toString() },
      },
    });

    return plan;
  }

  async findAll() {
    return this.prisma.challengePlan.findMany({
      include: {
        ruleSet: {
          include: {
            ruleSetRules: {
              include: {
                rule: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllActive() {
    return this.prisma.challengePlan.findMany({
      where: {
        status: ChallengeStatus.ACTIVE,
      },
      include: {
        ruleSet: {
          include: {
            ruleSetRules: {
              include: {
                rule: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const plan = await this.prisma.challengePlan.findUnique({
      where: { id },
      include: {
        ruleSet: {
          include: {
            ruleSetRules: {
              include: {
                rule: true,
              },
            },
          },
        },
      },
    });

    if (!plan) {
      throw new NotFoundException(`Challenge plan with ID ${id} not found`);
    }

    return plan;
  }

  async update(id: string, updateChallengePlanDto: UpdateChallengePlanDto, actorId: string) {
    await this.findOne(id);

    const plan = await this.prisma.challengePlan.update({
      where: { id },
      data: updateChallengePlanDto,
      include: {
        ruleSet: {
          include: {
            ruleSetRules: {
              include: {
                rule: true,
              },
            },
          },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'CHALLENGE_PLAN_UPDATED',
        entityType: 'ChallengePlan',
        entityId: plan.id,
        metadata: updateChallengePlanDto as any,
      },
    });

    return plan;
  }

  async updateStatus(id: string, status: ChallengeStatus, actorId: string) {
    await this.findOne(id);

    const plan = await this.prisma.challengePlan.update({
      where: { id },
      data: { status },
      include: {
        ruleSet: {
          include: {
            ruleSetRules: {
              include: {
                rule: true,
              },
            },
          },
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'CHALLENGE_PLAN_STATUS_CHANGED',
        entityType: 'ChallengePlan',
        entityId: plan.id,
        metadata: { status },
      },
    });

    return plan;
  }
}
