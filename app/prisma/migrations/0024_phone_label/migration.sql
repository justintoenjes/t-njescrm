-- CreateTable
CREATE TABLE "PhoneLabel" (
    "number" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "PhoneLabel_pkey" PRIMARY KEY ("number")
);

-- AddForeignKey
ALTER TABLE "PhoneLabel" ADD CONSTRAINT "PhoneLabel_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
