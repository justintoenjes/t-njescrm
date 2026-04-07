-- CreateTable
CREATE TABLE "_TemplateAssignees" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_TemplateAssignees_A_fkey" FOREIGN KEY ("A") REFERENCES "ProductTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_TemplateAssignees_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "_TemplateAssignees_AB_unique" ON "_TemplateAssignees"("A", "B");

-- CreateIndex
CREATE INDEX "_TemplateAssignees_B_index" ON "_TemplateAssignees"("B");
