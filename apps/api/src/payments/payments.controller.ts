import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PaymentsService } from './payments.service';
import { InitiateDepositDto } from './dto/initiate-deposit.dto';
import { TransferToTradingDto, TransferFromTradingDto } from './dto/transfer-funds.dto';
import { PaymentsQueryDto } from './dto/payments-query.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * User: Get platform wallet
   */
  @Get('wallet')
  @UseGuards(JwtAuthGuard)
  async getWallet(@Request() req: any) {
    return this.paymentsService.getOrCreateWallet(req.user.sub);
  }

  /**
   * User: Initiate checkout deposit
   */
  @Post('deposit')
  @UseGuards(JwtAuthGuard)
  async initiateDeposit(
    @Request() req: any,
    @Body() dto: InitiateDepositDto,
  ) {
    return this.paymentsService.initiateDeposit(req.user.sub, dto);
  }

  /**
   * User: Get wallet ledger / balance transaction history
   */
  @Get('history')
  @UseGuards(JwtAuthGuard)
  async getLedgerHistory(
    @Request() req: any,
    @Query() query: PaymentsQueryDto,
  ) {
    return this.paymentsService.getUserLedgerHistory(req.user.sub, query);
  }

  /**
   * User: Get payments list
   */
  @Get('my-payments')
  @UseGuards(JwtAuthGuard)
  async getUserPayments(
    @Request() req: any,
    @Query() query: PaymentsQueryDto,
  ) {
    return this.paymentsService.getUserPayments(req.user.sub, query);
  }

  /**
   * User: Transfer wallet balance to trading account
   */
  @Post('transfer-to-trading')
  @UseGuards(JwtAuthGuard)
  async transferToTrading(
    @Request() req: any,
    @Body() dto: TransferToTradingDto,
  ) {
    return this.paymentsService.transferToTradingAccount(req.user.sub, dto);
  }

  /**
   * User: Transfer trading account balance to wallet
   */
  @Post('transfer-from-trading')
  @UseGuards(JwtAuthGuard)
  async transferFromTrading(
    @Request() req: any,
    @Body() dto: TransferFromTradingDto,
  ) {
    return this.paymentsService.transferFromTradingAccount(req.user.sub, dto);
  }

  /**
   * Public: Webhook handler for payment providers
   */
  @Post('webhook/:provider')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Param('provider') provider: string,
    @Headers('stripe-signature') stripeSig: string,
    @Headers('x-signature') customSig: string,
    @Headers('x-webhook-signature') altSig: string,
    @Req() req: any,
  ) {
    const signature = stripeSig || customSig || altSig || '';
    const rawPayload = req.rawBody || JSON.stringify(req.body);

    return this.paymentsService.processWebhook(
      provider,
      rawPayload,
      signature,
      req.headers,
    );
  }
}
