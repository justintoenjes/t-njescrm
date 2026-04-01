-- CreateEnum
CREATE TYPE "LeadCategory" AS ENUM ('VERTRIEB', 'RECRUITING');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN "category" "LeadCategory" NOT NULL DEFAULT 'VERTRIEB';
