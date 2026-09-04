-- CreateTable
CREATE TABLE `trades` (
    `id` VARCHAR(191) NOT NULL,
    `tradingAccountId` VARCHAR(191) NOT NULL,
    `symbol` VARCHAR(191) NOT NULL,
    `side` ENUM('BUY', 'SELL') NOT NULL,
    `volume` DECIMAL(10, 4) NOT NULL,
    `entryPrice` DECIMAL(18, 8) NOT NULL,
    `exitPrice` DECIMAL(18, 8) NULL,
    `stopLoss` DECIMAL(18, 8) NULL,
    `takeProfit` DECIMAL(18, 8) NULL,
    `status` ENUM('OPEN', 'CLOSED', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
    `realizedPnl` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `trades` ADD CONSTRAINT `trades_tradingAccountId_fkey` FOREIGN KEY (`tradingAccountId`) REFERENCES `trading_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
