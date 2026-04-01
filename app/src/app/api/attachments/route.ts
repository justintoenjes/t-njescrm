import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { writeFile, mkdir, rename, unlink } from 'fs/promises';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const leadId = formData.get('leadId') as string | null;
  const opportunityId = formData.get('opportunityId') as string | null;

  if (!file) return NextResponse.json({ error: 'Keine Datei' }, { status: 400 });
  if (!leadId && !opportunityId) return NextResponse.json({ error: 'leadId oder opportunityId erforderlich' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Datei zu groß (max 20 MB)' }, { status: 400 });

  // Verify user has access to the target resource
  const isAdmin = session.user.role === 'ADMIN';
  if (leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { assignedToId: true } });
    if (!lead) return NextResponse.json({ error: 'Lead nicht gefunden' }, { status: 404 });
    if (!isAdmin && lead.assignedToId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (opportunityId) {
    const opp = await prisma.opportunity.findUnique({ where: { id: opportunityId }, select: { assignedToId: true, lead: { select: { assignedToId: true } } } });
    if (!opp) return NextResponse.json({ error: 'Opportunity nicht gefunden' }, { status: 404 });
    if (!isAdmin && opp.assignedToId !== session.user.id && opp.lead.assignedToId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const subDir = leadId ? `leads/${leadId}` : `opportunities/${opportunityId}`;
  const dir = path.join(UPLOAD_DIR, subDir);
  await mkdir(dir, { recursive: true });

  // Sanitize filename and make unique
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const uniqueName = `${Date.now()}_${safeName}`;
  const filePath = path.join(dir, uniqueName);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  const attachment = await prisma.attachment.create({
    data: {
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      leadId: leadId || undefined,
      opportunityId: opportunityId || undefined,
      uploadedById: session.user.id,
    },
    include: { uploadedBy: { select: { id: true, name: true } } },
  });

  // Rename file to use attachment ID for reliable lookup
  const finalName = `${attachment.id}_${safeName}`;
  const finalPath = path.join(dir, finalName);
  try {
    await rename(filePath, finalPath);
  } catch (err) {
    // Cleanup: remove DB record and uploaded file on rename failure
    await prisma.attachment.delete({ where: { id: attachment.id } }).catch(() => {});
    await unlink(filePath).catch(() => {});
    return NextResponse.json({ error: 'Datei konnte nicht gespeichert werden' }, { status: 500 });
  }

  return NextResponse.json(attachment, { status: 201 });
}
