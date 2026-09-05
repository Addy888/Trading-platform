-- Step 1: Migrate any existing SUCCESS values to COMPLETED (safe data migration)
UPDATE payments SET status = 'COMPLETED' WHERE status = 'SUCCESS';

-- Step 2: Remove SUCCESS from the enum
-- Note: ALTER ENUM in MySQL is done by modifying the column type
-- This is safe because we've already migrated all SUCCESS values to COMPLETED
ALTER TABLE `payments` MODIFY COLUMN `status` ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REJECTED', 'REFUNDED') NOT NULL DEFAULT 'PENDING';
