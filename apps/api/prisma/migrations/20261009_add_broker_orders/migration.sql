-- CreateEnum for BrokerOrderStatus
-- Normalized statuses across different brokers
CREATE TABLE IF NOT EXISTS `broker_orders` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `tradingAccountId` VARCHAR(191) NOT NULL,
  `brokerConnectionId` VARCHAR(191) NOT NULL,
  
  -- Trading mode
  `tradingMode` VARCHAR(50) NOT NULL DEFAULT 'SIMULATED',
  
  -- Instrument details
  `symbol` VARCHAR(50) NOT NULL,
  `exchange` VARCHAR(20) NULL,
  `instrumentToken` VARCHAR(50) NULL,
  
  -- Order details
  `side` ENUM('BUY', 'SELL') NOT NULL,
  `orderType` VARCHAR(20) NOT NULL,
  `quantity` DECIMAL(10, 4) NOT NULL,
  `price` DECIMAL(18, 8) NULL,
  `triggerPrice` DECIMAL(18, 8) NULL,
  `stopLoss` DECIMAL(18, 8) NULL,
  `takeProfit` DECIMAL(18, 8) NULL,
  
  -- Broker details
  `brokerOrderId` VARCHAR(100) NULL,
  `brokerStatus` VARCHAR(50) NULL,
  `brokerMessage` TEXT NULL,
  
  -- Normalized status
  `status` VARCHAR(50) NOT NULL DEFAULT 'PENDING_SUBMISSION',
  `statusMessage` TEXT NULL,
  
  -- Fill details
  `filledQuantity` DECIMAL(10, 4) NOT NULL DEFAULT 0,
  `averageFillPrice` DECIMAL(18, 8) NULL,
  `totalFillValue` DECIMAL(18, 2) NULL,
  `commission` DECIMAL(12, 2) NULL DEFAULT 0,
  
  -- Risk validation
  `riskValidationCode` VARCHAR(50) NULL,
  `riskValidationMessage` TEXT NULL,
  `riskValidationMetadata` JSON NULL,
  
  -- Idempotency
  `idempotencyKey` VARCHAR(191) NOT NULL,
  
  -- Reconciliation
  `needsReconciliation` BOOLEAN NOT NULL DEFAULT FALSE,
  `lastReconciliationAt` DATETIME(3) NULL,
  `reconciliationAttempts` INT NOT NULL DEFAULT 0,
  
  -- Rejection details
  `rejectedAt` DATETIME(3) NULL,
  `rejectionReason` TEXT NULL,
  `rejectionCode` VARCHAR(50) NULL,
  
  -- Timestamps
  `submittedAt` DATETIME(3) NULL,
  `acceptedAt` DATETIME(3) NULL,
  `filledAt` DATETIME(3) NULL,
  `cancelledAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  PRIMARY KEY (`id`),
  UNIQUE INDEX `broker_orders_idempotencyKey_key`(`idempotencyKey`),
  INDEX `broker_orders_userId_idx`(`userId`),
  INDEX `broker_orders_tradingAccountId_idx`(`tradingAccountId`),
  INDEX `broker_orders_brokerConnectionId_idx`(`brokerConnectionId`),
  INDEX `broker_orders_status_idx`(`status`),
  INDEX `broker_orders_brokerOrderId_idx`(`brokerOrderId`),
  INDEX `broker_orders_needsReconciliation_idx`(`needsReconciliation`),
  INDEX `broker_orders_createdAt_idx`(`createdAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Add foreign keys
ALTER TABLE `broker_orders` ADD CONSTRAINT `broker_orders_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `broker_orders` ADD CONSTRAINT `broker_orders_tradingAccountId_fkey` FOREIGN KEY (`tradingAccountId`) REFERENCES `trading_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `broker_orders` ADD CONSTRAINT `broker_orders_brokerConnectionId_fkey` FOREIGN KEY (`brokerConnectionId`) REFERENCES `broker_connections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Create order status history table for audit trail
CREATE TABLE IF NOT EXISTS `broker_order_status_history` (
  `id` VARCHAR(191) NOT NULL,
  `brokerOrderId` VARCHAR(191) NOT NULL,
  `previousStatus` VARCHAR(50) NULL,
  `newStatus` VARCHAR(50) NOT NULL,
  `statusMessage` TEXT NULL,
  `brokerResponse` JSON NULL,
  `changedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `broker_order_status_history_brokerOrderId_idx`(`brokerOrderId`),
  INDEX `broker_order_status_history_changedAt_idx`(`changedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `broker_order_status_history` ADD CONSTRAINT `broker_order_status_history_brokerOrderId_fkey` FOREIGN KEY (`brokerOrderId`) REFERENCES `broker_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
