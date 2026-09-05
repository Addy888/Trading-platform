-- CreateTable: Payouts
CREATE TABLE `payouts` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tradingAccountId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `status` ENUM('REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'PROCESSING', 'PAID', 'CANCELLED') NOT NULL DEFAULT 'REQUESTED',
    `payoutMethod` VARCHAR(191) NULL,
    `payoutReference` VARCHAR(191) NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reviewedAt` DATETIME(3) NULL,
    `reviewedBy` VARCHAR(191) NULL,
    `paidAt` DATETIME(3) NULL,
    `rejectionReason` TEXT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `payouts_userId_status_idx`(`userId`, `status`),
    INDEX `payouts_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: KYC Submissions
CREATE TABLE `kyc_submissions` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `status` ENUM('NOT_SUBMITTED', 'PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'RESUBMISSION_REQUIRED') NOT NULL DEFAULT 'NOT_SUBMITTED',
    `firstName` VARCHAR(191) NULL,
    `lastName` VARCHAR(191) NULL,
    `dateOfBirth` DATETIME(3) NULL,
    `address` TEXT NULL,
    `city` VARCHAR(191) NULL,
    `country` VARCHAR(191) NULL,
    `postalCode` VARCHAR(191) NULL,
    `documentType` VARCHAR(191) NULL,
    `documentNumber` VARCHAR(191) NULL,
    `documentFrontUrl` TEXT NULL,
    `documentBackUrl` TEXT NULL,
    `selfieUrl` TEXT NULL,
    `submittedAt` DATETIME(3) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewedBy` VARCHAR(191) NULL,
    `rejectionReason` TEXT NULL,
    `reviewNotes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `kyc_submissions_userId_idx`(`userId`),
    INDEX `kyc_submissions_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: Platform Settings
CREATE TABLE `platform_settings` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `description` TEXT NULL,
    `category` VARCHAR(191) NULL,
    `isPublic` BOOLEAN NOT NULL DEFAULT false,
    `updatedBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `platform_settings_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `payouts` ADD CONSTRAINT `payouts_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kyc_submissions` ADD CONSTRAINT `kyc_submissions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

