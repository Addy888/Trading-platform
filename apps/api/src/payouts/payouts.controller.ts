import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PayoutsService } from './payouts.service';
import { RequestPayoutDto } from './dto/request-payout.dto';

@Controller('payouts')
@UseGuards(JwtAuthGuard)
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Post()
  async requestPayout(@Body() requestPayoutDto: RequestPayoutDto, @Req() req) {
    const userId = req.user.sub;
    return this.payoutsService.requestPayout(userId, requestPayoutDto);
  }

  @Get()
  async getOwnPayouts(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Req() req,
  ) {
    const userId = req.user.sub;
    return this.payoutsService.getUserPayouts(
      userId,
      parseInt(page) || 1,
      parseInt(limit) || 20,
    );
  }

  @Get(':id')
  async getPayoutDetails(@Param('id') id: string, @Req() req) {
    const userId = req.user.sub;
    return this.payoutsService.getPayoutDetails(id, userId);
  }

  @Get('eligibility/:tradingAccountId')
  async checkEligibility(
    @Param('tradingAccountId') tradingAccountId: string,
    @Req() req,
  ) {
    const userId = req.user.sub;
    return this.payoutsService.checkPayoutEligibility(tradingAccountId, userId);
  }
}
