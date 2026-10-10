-- CreateTable
CREATE TABLE `broker_connections` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DISCONNECTED',
    `clientId` VARCHAR(191) NULL,
    `encryptedToken` TEXT NULL,
    `encryptedRefresh` TEXT NULL,
    `tokenExpiresAt` DATETIME(3) NULL,
    `lastConnectedAt` DATETIME(3) NULL,
    `lastErrorMessage` TEXT NULL,
    `lastErrorCode` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `broker_connections_userId_status_idx`(`userId`, `status`),
    UNIQUE INDEX `broker_connections_userId_provider_key`(`userId`, `provider`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `broker_connections` ADD CONSTRAINT `broker_connections_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
