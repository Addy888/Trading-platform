ALTER TABLE `trading_accounts`
    ADD COLUMN `isTestAccount` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `testFundingUserId` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `trading_accounts_testFundingUserId_key`
    ON `trading_accounts` (`testFundingUserId`);
