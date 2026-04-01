import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { unlink, readdir } from 'fs/promises';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const attachment = await prisma.attachment.findUnique({
    where: { id },
    include: {
      lead: { select: { assignedToId: true } },
      opportunity: { select: { assignedToId: true, lead: { select: { assignedToId: true } } } },
    },
  });
  if (!attachment) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });

  const isAdmin = session.user.role === 'ADMIN';
  const ownerId = attachment.lead?.assignedToId ?? attachment.opportunity?.assignedToId ?? attachment.opportunity?.lead?.assignedToId;
  if (!isAdmin && ownerId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Delete file from disk
  const subDir = attachment.leadId ? `leads/${attachment.leadId}` : `opportunities/${attachment.opportunityId}`;
  const dir = path.join(UPLOAD_DIR, subDir);
  const prefix = `${attachment.id}_`;

  try {
    const files = await readdir(dir);
    for (const f of files) {
      if (f.startsWith(prefix)) {
        await unlink(path.join(dir, f));
        break;
      }
    }
  } catch {
    // File may already be gone
  }

  await prisma.attachment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
