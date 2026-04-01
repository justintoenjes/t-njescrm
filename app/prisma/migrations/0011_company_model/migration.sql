-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");

-- Migrate existing company strings to Company records
INSERT INTO "Company" ("id", "name")
SELECT gen_random_uuid()::text, "company"
FROM (SELECT DISTINCT "company" FROM "Lead" WHERE "company" IS NOT NULL AND "company" != '') sub
ON CONFLICT ("name") DO NOTHING;

-- Add companyId to Lead
ALTER TABLE "Lead" ADD COLUMN "companyId" TEXT;

-- Link existing leads to their Company
UPDATE "Lead" SET "companyId" = c."id"
FROM "Company" c
WHERE "Lead"."company" = c."name";

-- Drop old company column
ALTER TABLE "Lead" DROP COLUMN "company";

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
