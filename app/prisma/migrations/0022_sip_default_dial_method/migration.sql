-- AlterTable: change default dialMethod from 'tel' to 'sip'
ALTER TABLE "User" ALTER COLUMN "dialMethod" SET DEFAULT 'sip';

-- Update existing users to use 'sip'
UPDATE "User" SET "dialMethod" = 'sip' WHERE "dialMethod" = 'tel';
