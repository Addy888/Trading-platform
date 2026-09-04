import { Module } from '@nestjs/common';
import { AccountSnapshotsService } from './account-snapshots.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [AccountSnapshotsService],
  exports: [AccountSnapshotsService],
})
export class AccountSnapshotsModule {}
