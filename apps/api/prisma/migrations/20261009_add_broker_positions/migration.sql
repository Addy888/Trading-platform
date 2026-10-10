-- MySQL version - Enums are defined inline with columns, not separately

-- CreateTable: Broker Positions (Real broker-confirmed positions)
CREATE TABLE `broker_positions` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `brokerConnectionId` VARCHAR(191) NOT NULL,
    `tradingAccountId` VARCHAR(191) NULL,
    
    -- Broker identity
    `brokerPositionId` VARCHAR(191) NULL,
    `exchange` VARCHAR(50) NOT NULL,
    `symbol` VARCHAR(100) NOT NULL,
    `symbolToken` VARCHAR(50) NOT NULL,
    `tradingSymbol` VARCHAR(191) NOT NULL,
    
    -- Product details
    `productType` VARCHAR(50) NOT NULL,
    `instrumentType` VARCHAR(191) NULL,
    
    -- Quantities (Decimal for precision)
    `netQuantity` DECIMAL(10,4) NOT NULL DEFAULT 0,
    `buyQuantity` DECIMAL(10,4) NOT NULL DEFAULT 0,
    `sellQuantity` DECIMAL(10,4) NOT NULL DEFAULT 0,
    
    -- Prices
    `netAveragePrice` DECIMAL(18,8) NULL,
    `buyAveragePrice` DECIMAL(18,8) NULL,
    `sellAveragePrice` DECIMAL(18,8) NULL,
    `lastTradedPrice` DECIMAL(18,8) NULL,
    `closePrice` DECIMAL(18,8) NULL,
    
    -- P&L (broker-confirmed)
    `realizedPnl` DECIMAL(12,2) NOT NULL DEFAULT 0,
    `unrealizedPnl` DECIMAL(12,2) NOT NULL DEFAULT 0,
    `totalPnl` DECIMAL(12,2) NOT NULL DEFAULT 0,
    `pnlPercentage` DECIMAL(10,4) NULL,
    
    -- Values
    `totalBuyValue` DECIMAL(18,2) NULL,
    `totalSellValue` DECIMAL(18,2) NULL,
    `netValue` DECIMAL(18,2) NULL,
    
    -- Contract details
    `multiplier` INTEGER NULL DEFAULT 1,
    `lotSize` INTEGER NULL DEFAULT 1,
    
    -- Position type (ENUM values: OPEN, CLOSED)
    `positionType` ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    
    -- Last sync metadata
    `lastSyncedAt` DATETIME(3) NOT NULL,
    `brokerRawData` JSON NULL,
    
    -- Timestamps
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: Broker Holdings (Long-term investments)
CREATE TABLE `broker_holdings` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `brokerConnectionId` VARCHAR(191) NOT NULL,
    
    -- Broker identity
    `exchange` VARCHAR(50) NOT NULL,
    `symbol` VARCHAR(100) NOT NULL,
    `symbolToken` VARCHAR(50) NOT NULL,
    `tradingSymbol` VARCHAR(191) NOT NULL,
    `isin` VARCHAR(191) NULL,
    
    -- Quantities
    `quantity` DECIMAL(10,4) NOT NULL DEFAULT 0,
    `t1Quantity` DECIMAL(10,4) NOT NULL DEFAULT 0,
    `realizedQuantity` DECIMAL(10,4) NOT NULL DEFAULT 0,
    `authorizedQuantity` DECIMAL(10,4) NOT NULL DEFAULT 0,
    `collateralQuantity` DECIMAL(10,4) NOT NULL DEFAULT 0,
    
    -- Prices
    `averagePrice` DECIMAL(18,8) NULL,
    `lastTradedPrice` DECIMAL(18,8) NULL,
    `closePrice` DECIMAL(18,8) NULL,
    
    -- P&L
    `profitAndLoss` DECIMAL(12,2) NOT NULL DEFAULT 0,
    `pnlPercentage` DECIMAL(10,4) NULL,
    
    -- Values
    `currentValue` DECIMAL(18,2) NULL,
    `investedValue` DECIMAL(18,2) NULL,
    
    -- Collateral
    `collateralType` VARCHAR(191) NULL,
    `haircut` DECIMAL(5,2) NULL,
    
    -- Last sync
    `lastSyncedAt` DATETIME(3) NOT NULL,
    `brokerRawData` JSON NULL,
    
    -- Timestamps
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: Portfolio Sync History
CREATE TABLE `broker_portfolio_syncs` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `brokerConnectionId` VARCHAR(191) NOT NULL,
    
    -- Sync details
    `syncType` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `completedAt` DATETIME(3) NULL,
    
    -- Results
    `positionsCount` INTEGER NULL,
    `holdingsCount` INTEGER NULL,
    `fundsData` JSON NULL,
    
    -- Error tracking
    `errorMessage` TEXT NULL,
    `errorCode` VARCHAR(191) NULL,
    
    -- Timestamps
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndexes for broker_positions
CREATE INDEX `broker_positions_userId_idx` ON `broker_positions`(`userId`);
CREATE INDEX `broker_positions_brokerConnectionId_idx` ON `broker_positions`(`brokerConnectionId`);
CREATE INDEX `broker_positions_tradingAccountId_idx` ON `broker_positions`(`tradingAccountId`);
CREATE INDEX `broker_positions_exchange_symbol_idx` ON `broker_positions`(`exchange`, `symbol`);
CREATE INDEX `broker_positions_symbolToken_idx` ON `broker_positions`(`symbolToken`);
CREATE INDEX `broker_positions_positionType_idx` ON `broker_positions`(`positionType`);
CREATE INDEX `broker_positions_lastSyncedAt_idx` ON `broker_positions`(`lastSyncedAt`);

-- Unique constraint: one position per user per broker per symbol per product
CREATE UNIQUE INDEX `broker_pos_user_conn_exch_sym_tok_prod_key` ON `broker_positions`(`userId`, `brokerConnectionId`, `exchange`, `symbol`, `symbolToken`, `productType`);

-- CreateIndexes for broker_holdings
CREATE INDEX `broker_holdings_userId_idx` ON `broker_holdings`(`userId`);
CREATE INDEX `broker_holdings_brokerConnectionId_idx` ON `broker_holdings`(`brokerConnectionId`);
CREATE INDEX `broker_holdings_exchange_symbol_idx` ON `broker_holdings`(`exchange`, `symbol`);
CREATE INDEX `broker_holdings_symbolToken_idx` ON `broker_holdings`(`symbolToken`);
CREATE INDEX `broker_holdings_lastSyncedAt_idx` ON `broker_holdings`(`lastSyncedAt`);

-- Unique constraint: one holding per user per broker per symbol
CREATE UNIQUE INDEX `broker_hold_user_conn_exch_sym_tok_key` ON `broker_holdings`(`userId`, `brokerConnectionId`, `exchange`, `symbol`, `symbolToken`);

-- CreateIndexes for broker_portfolio_syncs
CREATE INDEX `broker_portfolio_syncs_userId_idx` ON `broker_portfolio_syncs`(`userId`);
CREATE INDEX `broker_portfolio_syncs_brokerConnectionId_idx` ON `broker_portfolio_syncs`(`brokerConnectionId`);
CREATE INDEX `broker_portfolio_syncs_status_idx` ON `broker_portfolio_syncs`(`status`);
CREATE INDEX `broker_portfolio_syncs_startedAt_idx` ON `broker_portfolio_syncs`(`startedAt`);

-- AddForeignKey
ALTER TABLE `broker_positions` ADD CONSTRAINT `broker_positions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `broker_positions` ADD CONSTRAINT `broker_positions_brokerConnectionId_fkey` FOREIGN KEY (`brokerConnectionId`) REFERENCES `broker_connections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `broker_positions` ADD CONSTRAINT `broker_positions_tradingAccountId_fkey` FOREIGN KEY (`tradingAccountId`) REFERENCES `trading_accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `broker_holdings` ADD CONSTRAINT `broker_holdings_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `broker_holdings` ADD CONSTRAINT `broker_holdings_brokerConnectionId_fkey` FOREIGN KEY (`brokerConnectionId`) REFERENCES `broker_connections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `broker_portfolio_syncs` ADD CONSTRAINT `broker_portfolio_syncs_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `broker_portfolio_syncs` ADD CONSTRAINT `broker_portfolio_syncs_brokerConnectionId_fkey` FOREIGN KEY (`brokerConnectionId`) REFERENCES `broker_connections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
