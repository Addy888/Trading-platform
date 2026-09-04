-- CreateTable
CREATE TABLE `account_snapshots` (
    `id` VARCHAR(191) NOT NULL,
    `tradingAccountId` VARCHAR(191) NOT NULL,
    `balance` DECIMAL(12, 2) NOT NULL,
    `equity` DECIMAL(12, 2) NOT NULL,
    `realizedPnl` DECIMAL(12, 2) NOT NULL,
    `unrealizedPnl` DECIMAL(12, 2) NOT NULL,
    `totalPnl` DECIMAL(12, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `account_snapshots_tradingAccountId_createdAt_idx`(`tradingAccountId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `trading_accounts_userId_status_idx` ON `trading_accounts`(`userId`, `status`);

-- AddForeignKey
ALTER TABLE `account_snapshots` ADD CONSTRAINT `account_snapshots_tradingAccountId_fkey` FOREIGN KEY (`tradingAccountId`) REFERENCES `trading_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
