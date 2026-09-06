import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Req,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { KycService } from './kyc.service';
import { SubmitKycDto } from './dto/submit-kyc.dto';
import { UpdateKycDto } from './dto/update-kyc.dto';

@Controller('kyc')
@UseGuards(JwtAuthGuard)
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post()
  async submitKyc(@Body() submitKycDto: SubmitKycDto, @Req() req) {
    const userId = req.user.sub;
    return this.kycService.submitKyc(userId, submitKycDto);
  }

  @Get()
  async getOwnKyc(@Req() req) {
    const userId = req.user.sub;
    return this.kycService.getUserKyc(userId);
  }

  @Get(':id')
  async getKycDetails(@Param('id') id: string, @Req() req) {
    const userId = req.user.sub;
    return this.kycService.getKycDetails(id, userId);
  }

  @Patch(':id')
  async updateKyc(
    @Param('id') id: string,
    @Body() updateKycDto: UpdateKycDto,
    @Req() req,
  ) {
    const userId = req.user.sub;
    return this.kycService.updateKyc(id, userId, updateKycDto);
  }
}
