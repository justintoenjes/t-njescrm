-- AlterTable: add archived column
ALTER TABLE "Lead" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;

-- Migrate: INAKTIV leads become archived
UPDATE "Lead" SET "archived" = true WHERE "status" = 'INAKTIV';

-- AlterTable: drop status column
ALTER TABLE "Lead" DROP COLUMN "status";

-- DropEnum
DROP TYPE "LeadStatus";
