-- Step 1: Add new columns with defaults
ALTER TABLE "Lead" ADD COLUMN "firstName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Lead" ADD COLUMN "lastName" TEXT NOT NULL DEFAULT '';

-- Step 2: Migrate data — split "name" at last space
UPDATE "Lead" SET
  "firstName" = CASE
    WHEN position(' ' in "name") > 0
    THEN left("name", length("name") - length(substring("name" from '([^ ]+)$')) - 1)
    ELSE "name"
  END,
  "lastName" = CASE
    WHEN position(' ' in "name") > 0
    THEN substring("name" from '([^ ]+)$')
    ELSE ''
  END;

-- Step 3: Drop old column
ALTER TABLE "Lead" DROP COLUMN "name";
